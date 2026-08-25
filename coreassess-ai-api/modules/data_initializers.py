import os
import pandas as pd
from modules.conn import connectHANAdb, schema
from modules.logsetup import getLogger

logger = getLogger(__name__)

# Table prefix differs by container: CAP namespace CRA -> CRA_, legacy schema -> KCC_.
TABLE_PREFIX = os.getenv("TABLE_PREFIX", "CRA_")

hdbengine = connectHANAdb()

_norm = lambda df: df.rename(columns=lambda c: c.strip().upper().replace(' ', '_'))


# Reference reads must not crash the process; a missing table degrades analysis
# but the app still boots so /health can report what is wrong.
def _read(table: str, columns: list[str] | None = None) -> pd.DataFrame:
    try:
        return _norm(pd.read_sql(f"SELECT * FROM {schema}.{TABLE_PREFIX}{table}", hdbengine))
    except Exception as e:
        logger.error(f"E-REFDATA-{table} unreadable: {e}")
        return pd.DataFrame(columns=columns or [])


LOAD_ERRORS: list[str] = []


def _require(name: str, df: pd.DataFrame) -> pd.DataFrame:
    if df.empty: LOAD_ERRORS.append(name)
    return df


pricelist = _require("REF_PRICELIST", _read("REF_PRICELIST", ["ITEM", "PRICE_PER_UNIT", "METRICS"]))
if not pricelist.empty:
    pricelist = pricelist.replace('\xa0', ' ', regex=True).replace("Infinite", 1000000000)
    pricelist["PRICE_PER_UNIT"] = pd.to_numeric(
        pricelist["PRICE_PER_UNIT"].astype(str).str.replace(",", "", regex=True), errors="coerce")

# Fiori app IDs are resolved live via MCP (see helpers.addFioriAppId). The offline
# REF_FIORIAPPS table was stale, so it is no longer loaded or used.

events_list = _require("REF_EVENTS", _read("REF_EVENTS", ["EVENTNAME"]))
events_str = (','.join(events_list['EVENTNAME'].str.extract(r'beh/(.+)')[0].dropna())
              if not events_list.empty else "")


def _readConfig() -> pd.DataFrame:
    try:
        df = pd.read_sql(
            f"SELECT * FROM {schema}.{TABLE_PREFIX}CONFIG_MSTR a "
            f"JOIN {schema}.{TABLE_PREFIX}CONFIG_DETAILS b ON a.ID = b.CONFIG_MSTR_ID", hdbengine)
        df.columns = [f"{c}_mstr" if i == 0 else f"{c}_details" if c == "id" else c
                      for i, c in enumerate(df.columns)]
        return _norm(df)
    except Exception as e:
        logger.error(f"E-REFDATA-CONFIG unreadable: {e}")
        return pd.DataFrame(columns=["SUBFIELD", "COUNT_FROM", "COUNT_TO", "COMPLEXITY", "EFFORTS"])


config_all = _require("CONFIG_MSTR", _readConfig())
config_numeric = config_all.replace("Low", "1").replace("Medium", "2").replace("High", "3")

tshirt_config = _require("TSHIRT_CONFIG", _read("TSHIRT_CONFIG", ["FROM_HRS", "TO_HRS", "TSHIRT"]))
priority_weights = _require("PRIORITY_CONFIG", _read("PRIORITY_CONFIG", ["METRIC", "COMPLEXITY", "HIGH_IMPACT"]))

if LOAD_ERRORS:
    logger.error(f"E-REFDATA-missing tables (prefix {TABLE_PREFIX}): {', '.join(LOAD_ERRORS)}")

#------------------------------------------- SAP module priority
sap_mod_5 = ["FI - Financial Accounting", "CO - Controlling", "MM - Materials Management", "SD - Sales and Distribution", "PP - Production Planning", "GRC - Governance, Risk, and Compliance", "TRM - Treasury and Risk Management", "S/4HANA", "BTP - Business Technology Platform", "SCM - Supply Chain Management"]
sap_mod_4 = ["HCM - Human Capital Management", "WM - Warehouse Management", "PS - Project System", "EWM - Extended Warehouse Management", "TM - Transportation Management", "BI - Business Intelligence", "BPC - Business Planning and Consolidation"]
sap_mod_3 = ["PM - Plant Maintenance", "QM - Quality Management", "CRM - Customer Relationship Management", "SRM - Supplier Relationship Management", "CS - Customer Service", "PLM - Product Lifecycle Management", "RE-FX - Flexible Real Estate Management", "IS - Industry Solutions", "BW - Business Warehouse", "CX - Customer Experience"]
