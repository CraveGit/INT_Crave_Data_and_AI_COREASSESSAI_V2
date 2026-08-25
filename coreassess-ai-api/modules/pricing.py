"""BTP price list refresh pipeline: fetch -> normalise -> validate -> stage -> apply.

Source of truth is the SAP Discovery Center service catalogue, which exposes the
same data the public estimator uses. A refresh never overwrites the live table
until the payload passes validation, so a bad scrape cannot empty pricing.
"""
import os
import csv
import json
import logging
import datetime
from urllib.request import Request, urlopen

import pandas as pd
from sqlalchemy import text

logger = logging.getLogger(__name__)

CATALOG_URL = os.getenv(
    "BTP_CATALOG_URL",
    "https://discovery-center.cloud.sap/servicecatalog/api/v1/services?provider=SAP")
USER_AGENT = "coreassess-pricing/1.0"
TIMEOUT = int(os.getenv("PRICING_FETCH_TIMEOUT", "60"))

COLUMNS = ["ID", "ITEMCODE", "ITEM", "IN_BLOCKS", "METRICS",
           "PRICE_PER_UNIT", "CURRENCY", "FEES", "VOLUME_FROM", "VOLUME_TO"]

# A healthy catalogue is in the thousands of rows; anything tiny means a broken
# scrape (login wall, schema change) and must not replace live pricing.
MIN_ROWS = int(os.getenv("PRICING_MIN_ROWS", "200"))


def _fetch(url):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def _rows_from_catalog(payload):
    services = payload if isinstance(payload, list) else payload.get("value") or payload.get("services") or []
    rows = []
    for service in services:
        name = service.get("Name") or service.get("name") or service.get("ServiceName")
        if not name:
            continue
        for plan in (service.get("ServicePlans") or service.get("plans") or [{}]):
            metric = plan.get("Metric") or plan.get("metric") or ""
            price = plan.get("Price") or plan.get("price")
            rows.append({
                "ITEMCODE": str(service.get("Code") or service.get("id") or "")[:40],
                "ITEM": str(name)[:200],
                "IN_BLOCKS": int(plan.get("Blocks") or 1),
                "METRICS": str(metric)[:100],
                "PRICE_PER_UNIT": _num(price),
                "CURRENCY": str(plan.get("Currency") or plan.get("currency") or "EUR")[:10],
                "FEES": str(plan.get("Fees") or "")[:60],
                "VOLUME_FROM": str(plan.get("VolumeFrom") or ""),
                "VOLUME_TO": str(plan.get("VolumeTo") or ""),
            })
    return rows


def _num(value):
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _validate(rows):
    problems = []
    if len(rows) < MIN_ROWS:
        problems.append(f"only {len(rows)} rows (min {MIN_ROWS})")
    priced = [r for r in rows if r.get("PRICE_PER_UNIT") is not None]
    if rows and len(priced) / max(len(rows), 1) < 0.25:
        problems.append("fewer than a quarter of rows carry a price")
    if not any(r.get("ITEM") for r in rows):
        problems.append("no service names parsed")
    return problems


def fetchPriceList(url=None):
    """Returns (rows, problems). Never raises; a failed fetch yields ([], [reason])."""
    try:
        payload = _fetch(url or CATALOG_URL)
    except Exception as e:
        logger.error(f"E-PRICING-fetch failed: {e}")
        return [], [f"fetch failed: {e}"]
    rows = _rows_from_catalog(payload)
    for index, row in enumerate(rows, 1):
        row["ID"] = index
    return rows, _validate(rows)


def writeSeedCsv(rows, path):
    """Emit the CAP seed file (db/data/CRA-REF_PRICELIST.csv)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return path


def applyToHana(rows, engine, schema, table_prefix="CRA_", dry_run=True):
    """Replace the reference price list inside one transaction. dry_run reports
    the delta without writing."""
    table = f"{schema}.{table_prefix}REF_PRICELIST"
    frame = pd.DataFrame(rows, columns=COLUMNS)
    with engine.begin() as connection:
        current = connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        if dry_run:
            return {"dry_run": True, "existing_rows": current, "incoming_rows": len(frame)}
        connection.execute(text(f"DELETE FROM {table}"))
        frame.to_sql(f"{table_prefix}REF_PRICELIST", connection, schema=schema,
                     if_exists="append", index=False)
        return {"dry_run": False, "replaced_rows": current, "written_rows": len(frame),
                "at": datetime.datetime.now().isoformat(timespec="seconds")}


def refresh(engine=None, schema=None, seed_path=None, dry_run=True, url=None):
    """One entry point for the endpoint and the CLI."""
    rows, problems = fetchPriceList(url)
    result = {"fetched_rows": len(rows), "problems": problems, "applied": None,
              "seed_csv": None}
    if problems:
        logger.error(f"E-PRICING-validation: {'; '.join(problems)}")
        return result
    if seed_path:
        result["seed_csv"] = writeSeedCsv(rows, seed_path)
    if engine is not None and schema:
        result["applied"] = applyToHana(rows, engine, schema, dry_run=dry_run)
    return result
