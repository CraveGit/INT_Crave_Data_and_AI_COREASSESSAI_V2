#------------------------------------------- Get complexities
import math
import pandas as pd

from modules.logsetup import getLogger
from modules.helpers import extractEssentials
from modules.data_initializers import sap_mod_3, sap_mod_4, sap_mod_5

logger = getLogger(__name__)

def getComplexities(complete_analysis: dict):
    stats = extractEssentials(complete_analysis)
    all_tables_count = len(stats["custom_tables"]) + len(stats["standard_tables"])
    bapi_fm_count = len(stats["bapis"]) + len(stats["function_modules"])
    sap_module = stats["sap_module"]

    def get_complexity(field, count):
        return next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == field].iterrows() if row["COUNT_FROM"] <= count <= row["COUNT_TO"]), 0)

    def get_sapmodule_complexity(sap_module):
        if any(sap_module.lower() in module.lower() for module in sap_mod_5): return 3
        elif any(sap_module.lower() in module.lower() for module in sap_mod_4): return 2
        elif any(sap_module.lower() in module.lower() for module in sap_mod_3): return 1
        else: return 0

    table_complexity = get_complexity("Tables", all_tables_count)
    bapi_fm_complexity = get_complexity("BAPI + Function Modules", bapi_fm_count)
    screens_complexity = get_complexity("Screens", stats["screens_count"])
    workflows_complexity = get_complexity("Workflows", stats["workflows_count"])
    bdc_complexity = get_complexity("BDC", stats["bdcs_count"])
    forms_complexity = get_complexity("Forms", stats["forms_count"])
    code_complexity = get_complexity("Code Size", stats["codelength"])
    crudops_complexity = max(list(int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "CRUD"].iterrows() if row["SUBFIELD"].lower() in stats["crud_ops"]), default=0)
    integration_complexity = next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "3rd Party Integration"].iterrows()), 3) if stats["thirdparty_intgr"] else next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "UI5 Integration"].iterrows()), 2) if stats["ui_intgr"] else 0
    ui_int_complexity = next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "UI5 Integration"].iterrows()), 0)
    thirdparty_int_complexity = next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "3rd Party Integration"].iterrows()), 0)
    validations_complexity = next((int(row["COMPLEXITY"]) for _, row in config_numeric[config_numeric["FIELD"] == "Logic Validation"].iterrows() if stats["validations"]), 0)
    sap_module_complexity = get_sapmodule_complexity(sap_module)
    
    return {
        "table_complexity": table_complexity,
        "bapi_fm_complexity": bapi_fm_complexity,
        "screens_complexity": screens_complexity,
        "workflows_complexity": workflows_complexity,
        "bdc_complexity": bdc_complexity,
        "forms_complexity": forms_complexity,
        "code_complexity": code_complexity,
        "crudops_complexity": crudops_complexity,
        "integration_complexity": integration_complexity,
        "ui_int_complexity": ui_int_complexity,
        "thirdparty_int_complexity": thirdparty_int_complexity,
        "validations_complexity": validations_complexity,
        "sap_module_complexity": sap_module_complexity
    }

#------------------------------------------- Get development hours
from modules.data_initializers import config_numeric

def getEstHours(complete_analysis: dict):
    def getHours(field: str):
        return {int(row["COMPLEXITY"]): row["EFFORTS"] for _, row in config_numeric[config_numeric["FIELD"] == field].iterrows()}
    
    stats = extractEssentials(complete_analysis)
    complexities = getComplexities(complete_analysis)

    fields = {
        "table": "Tables",
        "bapi_fm": "BAPI + Function Modules",
        "crudops": "CRUD",
        "ui_integration": "UI5 Integration",
        "thirdparty_integration": "3rd Party Integration",
        "screens": "Screens",
        "workflows": "Workflows",
        "bdcs": "BDC",
        "forms": "Forms",
        "validations": "Logic Validation",
        "codesize": "Code Size",
    }
    hours_lookup = {key: getHours(value) for key, value in fields.items()}

    table_hours = hours_lookup["table"].get(complexities['table_complexity'], 0)
    bfm_hours = hours_lookup["bapi_fm"].get(complexities['bapi_fm_complexity'], 0)
    crudops_hours = hours_lookup["crudops"].get(complexities['crudops_complexity'], 0)
    screens_hours = hours_lookup["screens"].get(complexities['screens_complexity'], 0)
    workflows_hours = hours_lookup["workflows"].get(complexities['workflows_complexity'], 0)
    bdc_hours = hours_lookup["bdcs"].get(complexities['bdc_complexity'], 0)
    forms_hours = hours_lookup["forms"].get(complexities['forms_complexity'], 0)
    validations_hours = hours_lookup["validations"].get(complexities['validations_complexity'], 0)
    code_hours = hours_lookup["codesize"].get(complexities['code_complexity'], 0)
    ui_integration_hours = hours_lookup["ui_integration"].get(complexities['ui_int_complexity'], 0) if stats["ui_intgr"] else 0
    # Was reading the "ui_integration" table for 3rd-party effort, which understated
    # any object with an external interface.
    thirdparty_integration_hours = hours_lookup["thirdparty_integration"].get(complexities['thirdparty_int_complexity'], 0) if stats["thirdparty_intgr"] else 0

    return {
        "table_hours": table_hours,
        "bfm_hours": bfm_hours,
        "crudops_hours": crudops_hours,
        "screens_hours": screens_hours,
        "workflows_hours": workflows_hours,
        "bdc_hours": bdc_hours,
        "forms_hours": forms_hours,
        "validations_hours": validations_hours,
        "code_hours": code_hours,
        "integration_hours": ui_integration_hours + thirdparty_integration_hours
    }

#------------------------------------------- Set T-shirt size
from modules.data_initializers import tshirt_config

def getTShirtSize(est_efforts: dict | int | str):
    if(isinstance(est_efforts, dict)): est_efforts_num = sum(est_efforts.values()) - est_efforts["code_hours"]
    elif(isinstance(est_efforts, str)): est_efforts_num = int(est_efforts)
    else: est_efforts_num = est_efforts

    if(est_efforts_num<=0): return 0
    if tshirt_config.empty:
        logger.warning("E-SIZING-TSHIRT_CONFIG empty; cannot size")
        return 0

    # Bands are authored as inclusive integer ranges (1-40, 41-100, ...), but callers
    # pass fractional hours (extended_hours/2), which fall between bands. Round up to
    # the next whole hour so a part-hour never lands in the gap.
    hours = math.ceil(est_efforts_num)
    # Coerce the band edges to numbers: if the deployed TSHIRT_CONFIG stored FROM_HRS/
    # TO_HRS as text, sort_values() sorts lexicographically and the <= compares fail,
    # collapsing everything onto the clamp (which is how every object became XL).
    bands = tshirt_config.copy()
    bands["FROM_HRS"] = pd.to_numeric(bands["FROM_HRS"], errors="coerce")
    bands["TO_HRS"] = pd.to_numeric(bands["TO_HRS"], errors="coerce")
    bands = bands.dropna(subset=["FROM_HRS", "TO_HRS"]).sort_values("FROM_HRS")
    if bands.empty:
        logger.warning("E-SIZING-TSHIRT_CONFIG has no numeric bands; cannot size")
        return 0

    size, how = None, ""
    for _, row in bands.iterrows():
        if row["FROM_HRS"] <= hours <= row["TO_HRS"]:
            size, how = row["TSHIRT"], f"band {int(row['FROM_HRS'])}-{int(row['TO_HRS'])}"
            break
    if size is None:
        top = bands.iloc[-1]
        if hours > top["TO_HRS"]:
            size, how = top["TSHIRT"], f"clamp>top({int(top['TO_HRS'])})"
        else:
            size, how = bands.iloc[0]["TSHIRT"], "below-first"
    logger.info(f"E-TSHIRT hours={hours} -> {size} ({how}); bands="
                f"{[(int(f), int(t), s) for f, t, s in zip(bands.FROM_HRS, bands.TO_HRS, bands.TSHIRT)]}")
    return size

#------------------------------------------- Set Priority
from modules.data_initializers import priority_weights

def getPriority(complete_analysis: dict):
    complexities = getComplexities(complete_analysis)
    # These are folded into integration_complexity already; scoring them again
    # would double-count. ("stats" is never a key here -- kept out deliberately.)
    for key in ["validations_complexity", "ui_int_complexity", "thirdparty_int_complexity"]:
        complexities.pop(key, None)

    if priority_weights.empty:
        logger.warning("E-PRIORITY-PRIORITY_CONFIG empty; defaulting to Medium")
        return "Medium"

    weights = dict(zip(priority_weights["METRIC"], priority_weights["HIGH_IMPACT"]))
    high_impact_factors = set(priority_weights[priority_weights["HIGH_IMPACT"] == 1]["METRIC"])
    scale_factor = 1.5

    def weightOf(factor):
        base = weights.get(factor)
        if base is None:
            # An unweighted factor scores 0 rather than raising; a config gap must not
            # abort an analysis that already cost a full LLM fan-out.
            logger.warning(f"E-PRIORITY-no weight for '{factor}'; scored 0")
            return 0
        return base * scale_factor if factor in high_impact_factors else base

    total_score = sum(complexities[f] * weightOf(f) for f in complexities)
    max_possible_score = sum(weightOf(f) * 3 for f in weights)
    if not max_possible_score:
        return "Medium"

    thresholds = {"High": 0.7 * max_possible_score, "Medium": 0.4 * max_possible_score}
    return next((priority for priority, threshold in thresholds.items() if total_score >= threshold), "Low")

#------------------------------------------- Get side by side development efforts
from modules.helpers import isAppDev, isAutomation, isAppDevAutomation, isIntegration, isDataAnalytics

def getMigrationEfforts(complete_analysis: dict):
    stats = extractEssentials(complete_analysis)
    all_tables_count = len(stats["custom_tables"]) + len(stats["standard_tables"])
    ui_fields_count = stats["ui_fields_count"]
    total_services = len(complete_analysis["technical_analysis"]["BTPServices"])

    tables_complexity = 1 if 0 < all_tables_count <= 5 else 2 if 5 < all_tables_count <= 10 else 3 if all_tables_count > 10 else 0
    # 3 services previously fell through every branch and scored 0 (same as "none").
    total_services_complexity = 1 if 0 < total_services <= 2 else 2 if 2 < total_services <= 5 else 3 if total_services > 5 else 0
    fields_on_screens_complexity = 1 if 0 < ui_fields_count <= 5 else 2 if 5 < ui_fields_count <= 10 else 3 if ui_fields_count > 10 else 0
    workflows_complexity = stats["workflows_complexity"]
    reports_complexity = stats["reports_complexity"]
    
    base_hours = {
        "tables":8,
        "workflows":12,
        "total_services":12,
        "ui_fields":12,
        "report":10
    }
    hours_lookup = {
        "tables": {3: 2, 2: 1.5, 1: 1.2, 0:0},
        "workflows": {3: 3.5, 2: 2.5, 1: 1.5, 0:0},
        "total_services": {3: 3, 2: 2, 1: 1.5, 0:0},
        "ui_fields": {3: 2, 2: 1.5, 1: 1.2, 0:0},
        "report": {3: 2.5, 2: 1.8, 1: 1.2, 0:0}
    }

    total_hours = (
        base_hours["tables"] * hours_lookup["tables"].get(tables_complexity, 0) +
        base_hours["workflows"] * hours_lookup["workflows"].get(workflows_complexity, 0) +
        base_hours["total_services"] * hours_lookup["total_services"].get(total_services_complexity, 0) +
        base_hours["ui_fields"] * hours_lookup["ui_fields"].get(fields_on_screens_complexity, 0) +
        base_hours["report"] * hours_lookup["report"].get(reports_complexity, 0)
    )

    return total_hours

def quantifyMigrationEfforts(complete_analysis: dict):
    init_efforts = int(getMigrationEfforts(complete_analysis))
    stats = extractEssentials(complete_analysis)
    basic_analysis = complete_analysis["basic_analysis"]

    total_hours = 0
    if(stats["workflows_count"]>0): total_hours += init_efforts
    if(isAppDevAutomation(basic_analysis)): total_hours = init_efforts * 2
    elif(isAutomation(basic_analysis) or isAppDev(basic_analysis) or isIntegration(basic_analysis) or isDataAnalytics(basic_analysis)): total_hours += init_efforts
    return total_hours

#------------------------------------------- Apply realism factors to effort (non-linear overlay)
import re as _re

# Editable factor tables (deterministic, explainable). Multiplicative on top of the
# additive component estimate so the SAME object costs very differently by approach.
# hybrid: reuses released standard (less to build than a full side-by-side rebuild)
# but carries BTP-side + stack-integration work -> between on-stack and side-by-side.
APPROACH_FACTORS = {"retire": 0.15, "on-stack": 0.6, "hybrid": 0.8, "side-by-side": 1.0}
ADHERENCE_DEBT   = {"none": 1.3, "partial": 1.1, "full": 1.0}

def applyEffortFactors(complete_analysis: dict):
    """Scale the final effort by approach, clean-core debt and code-quality factors.
    - approach_factor: retire collapses effort; on-stack cheaper than a full
      side-by-side rebuild.
    - adherence_debt: dirtier core coupling (None) needs more remediation.
    - quality_factor: poorer code quality inflates effort (up to +50%).
    Keeps ManEfforts (str) / TShirtSize keys; adds EffortFactors for auditability."""
    if not complete_analysis: return complete_analysis
    ba = complete_analysis["basic_analysis"]
    try: base = int(float(ba.get("ManEfforts", 0) or 0))
    except (TypeError, ValueError): base = 0

    approach = (ba.get("RecommendedApproach") or "").lower()
    adher    = (ba.get("CleanCoreAdherence") or "").lower()
    try: score = float(_re.sub(r"[^0-9.]", "", str(ba.get("CodeQualityScore", "")) or "") or 100)
    except ValueError: score = 100.0

    af = APPROACH_FACTORS.get(approach, 1.0)
    df = ADHERENCE_DEBT.get(adher, 1.0)
    qf = 1 + max(0.0, (100.0 - score)) / 200.0     # score 100 -> 1.0 ; score 0 -> 1.5

    factored = max(1, round(base * af * df * qf))
    ba["ManEfforts"] = str(factored)
    ba["TShirtSize"] = getTShirtSize(factored / 2)
    ba["EffortFactors"] = {"base": base, "approach_factor": af, "adherence_debt": df,
                           "quality_factor": round(qf, 3), "final": factored}
    return complete_analysis

#------------------------------------------- Get setup, dev, deployment & testing efforts
def getExtendedEfforts(complete_analysis: dict):
    development_hours = int(complete_analysis["basic_analysis"]["ManEfforts"])   # 50%
    total_hours = development_hours * 2    # 100%
    design_hours = total_hours * 0.15    # 15%
    test_hours = total_hours * 0.25    # 25%
    deployment_hours = total_hours * 0.1    # 10%

    return {
        "development_hours": development_hours,
        "design_hours": design_hours,
        "test_hours": test_hours,
        "deployment_hours": deployment_hours,
        "total_hours": total_hours,
    }