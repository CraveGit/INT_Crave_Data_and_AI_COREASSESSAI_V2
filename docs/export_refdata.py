"""Port reference/config tables from the OLD HANA schema into CAP seed CSVs.

Reads 5 tables from the old schema (creds from coreassess-ai-api/.env) and writes
db/data/CRA-*.csv with headers matching the new CAP entity element names. These
auto-seed into the new HDI container on `cds deploy` / MTA deploy.

Run once from the ai-api folder so .env loads:
    cd coreassess_v2/coreassess-ai-api
    python ../docs/export_refdata.py

Already-staged (do NOT re-export): REF_PRICELIST, BTP_SERVICES_PRICE_LIST, REF_FIORIAPPS.
"""
import os, csv
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()  # coreassess-ai-api/.env  -> old-schema creds
HOST = os.getenv("HANA_HOST"); PORT = os.getenv("HANA_PORT", "443")
USER = os.getenv("HANA_USER"); PWD = os.getenv("HANA_PASS")
SCHEMA = os.getenv("SCHEMA")
OUT = os.path.join(os.path.dirname(__file__), "..", "coreassess-app", "db", "data")
OUT = os.path.abspath(OUT)

assert all([HOST, USER, PWD, SCHEMA]), "missing HANA_* / SCHEMA in .env"
os.makedirs(OUT, exist_ok=True)
engine = create_engine(f"hana+hdbcli://{USER}:{PWD}@{HOST}:{PORT}")

# old table -> (new seed entity, {old_col_upper: new_col}). Columns not listed dropped.
JOBS = [
    ("KCC_CONFIG_MSTR", "CONFIG_MSTR",
     {"ID": "ID", "FIELD": "FIELD"}),
    ("KCC_CONFIG_DETAILS", "CONFIG_DETAILS",
     {"ID": "ID", "CONFIG_MSTR_ID": "CONFIG_MSTR_ID", "SUBFIELD": "SUBFIELD",
      "COUNT_FROM": "COUNT_FROM", "COUNT_TO": "COUNT_TO", "COMPLEXITY": "COMPLEXITY", "EFFORTS": "EFFORTS"}),
    ("KCC_TSHIRT_CONFIG", "TSHIRT_CONFIG",
     {"ID": "ID", "FROM_HRS": "FROM_HRS", "TO_HRS": "TO_HRS", "TSHIRT": "TSHIRT"}),
    ("KCC_PRIORITY_CONFIG", "PRIORITY_CONFIG",
     {"ID": "ID", "METRIC": "METRIC", "COMPLEXITY": "COMPLEXITY", "HIGH_IMPACT": "HIGH_IMPACT"}),
    ("KCC_REF_EVENTS", "REF_EVENTS",
     {"ID": "ID", "EVENTNAME": "EVENTNAME"}),
]

for old_tbl, entity, colmap in JOBS:
    try:
        df = pd.read_sql(text(f'SELECT * FROM "{SCHEMA}"."{old_tbl}"'), engine)
    except Exception as e:
        print(f"SKIP {old_tbl}: {e}")
        continue
    df.columns = [c.strip().upper() for c in df.columns]
    keep = {old: new for old, new in colmap.items() if old in df.columns}
    missing = [o for o in colmap if o not in df.columns]
    if missing:
        print(f"WARN {old_tbl}: missing cols {missing} (available: {list(df.columns)})")
    out = df[list(keep.keys())].rename(columns=keep)
    path = os.path.join(OUT, f"CRA-{entity}.csv")
    out.to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)
    print(f"OK  {old_tbl} -> {path}  ({len(out)} rows, cols={list(out.columns)})")

print("\nDone. Review db/data/CRA-*.csv, then deploy CAP to seed the new container.")
