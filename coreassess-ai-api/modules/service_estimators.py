from modules.data_initializers import pricelist
from modules.helpers import extractEssentials, isReport, isInterface, isAutomation, isAppDev

# ---------------------------------------------------------------------------
# Service-quantity framework
# Every BlocksRequired must trace to a DRIVER, never a magic constant:
#   - footprint tier (S/M/L): overall build size  -> runtime / capacity / seats
#   - storage  tier (S/M/L): data footprint        -> HANA CU, document API calls
#   - volume proxies (forms count, file flag)      -> API-metered services
#   - user answers (questionnaire)                 -> user/connection-metered services
# Tier defaults are the ANALYSIS baseline; a questionnaire answer, when supplied,
# OVERRIDES the default (see getCustomServices). All thresholds/quantities live in
# SIZING so they are tunable without touching logic. See CoreAssess_Assessment_Logic.md #10.
# ---------------------------------------------------------------------------
SIZING = {
    "hana_cu":    {"S": 3000, "M": 6000, "L": 12000},    # SAP HANA Cloud - Capacity Unit
    "cf_gb":      {"S": 4,    "M": 10,   "L": 20},       # CF runtime - Gigabyte
    "abap_hours": {"S": 730,  "M": 730,  "L": 1460},     # ABAP env - Hours (16GB blocks), ~monthly
    "doc_calls":  {"S": 50000, "M": 150000, "L": 500000},# Document Mgmt - API Call
    "wz_users":   {"S": 25,   "M": 50,   "L": 100},      # Work Zone - Active User (default; Q overrides)
    "build_pkgs": {"S": 1,    "M": 2,    "L": 4},        # Build Apps - Entitlements Package
    "sac_users":  {"S": 5,    "M": 10,   "L": 25},       # SAC - User (default; Q overrides)
    "forms_calls_per_form": 1000,                        # Adobe Forms - API Call per form/month
}


def _footprint_tier(stats) -> str:
    """Overall build size from the analysis facts. <8 = S, <20 = M, else L."""
    score = (2 * (len(stats["custom_tables"]) + len(stats["standard_tables"]))
             + 1.5 * (stats["screens_count"] or 0)
             + len(stats["bapis"]) + len(stats["function_modules"])
             + (stats["codelength"] or 0) / 500.0
             + 2 * (len(stats["events"]) + len(stats["standard_events"])))
    return "S" if score < 8 else ("M" if score < 20 else "L")


def _storage_tier(stats) -> str:
    """Data footprint. <=2 = S, <=6 = M, else L."""
    score = (len(stats["custom_tables"])
             + (2 if (stats["is_data_storage"] or stats["will_data_storage"]) else 0)
             + (1 if stats["persistant_storage"] else 0))
    return "S" if score <= 2 else ("M" if score <= 6 else "L")


#------------------------------------------- Check if is a Build use case
def checkBuildCondition(complete_analysis: dict) -> bool:
    if not complete_analysis: return False

    stats = extractEssentials(complete_analysis)
    all_tables_count, bapis_count, screens_count, codelength, bdc, thirdparty_intgr = (
        len(stats["custom_tables"]) + len(stats["standard_tables"]),
        len(stats["bapis"]),
        stats["screens_count"],
        stats["codelength"],
        stats["bdcs_count"],
        stats["thirdparty_intgr"],
    )

    anti_build_conditions = [
        all_tables_count > 2,
        bapis_count > 2,
        screens_count > 5,
        codelength > 1000,
        bdc > 0,
        thirdparty_intgr,
    ]

    return not any(anti_build_conditions)

#------------------------------------------- Get Basic services (storage/automation)
def getBasicServices(complete_analysis: dict) -> list:
    services = []
    if not complete_analysis: return services

    stats = extractEssentials(complete_analysis)

    __basic_analysis = complete_analysis["basic_analysis"]
    forms_count = stats["forms_count"]
    custom_tables = len(stats["custom_tables"])
    persistant_storage = stats["persistant_storage"]
    data_storage_required = stats["is_data_storage"]
    data_storage_suggested = stats["will_data_storage"]
    analytical_report = stats["is_analytical_report"]
    thirdparty_intgr = stats["thirdparty_intgr"]
    events_used = len(stats["events"])
    standard_events = len(stats["standard_events"])
    file_storage_required = stats["is_file_storage"]
    file_storage_suggested = stats["will_file_storage"]

    if forms_count:
        services.append({"ServiceName":"SAP Forms Service by Adobe","BlocksRequired":str(max(1, forms_count) * SIZING["forms_calls_per_form"]),"Metric":"API Call"})
    if(data_storage_required or data_storage_suggested or (custom_tables>0 and persistant_storage)): 
        services.append({"ServiceName":"SAP HANA Cloud","BlocksRequired":str(SIZING["hana_cu"][_storage_tier(stats)]),"Metric":"Capacity Unit"})
    if isReport(__basic_analysis) and analytical_report: 
        services.append({"ServiceName":"SAP Analytics Cloud for planning, standard edition, public system option","BlocksRequired":str(SIZING["sac_users"][_footprint_tier(stats)]),"Metric":"User"})
    if(thirdparty_intgr or isInterface(__basic_analysis)):
        services.append({"ServiceName":"SAP Integration Suite, basic edition","BlocksRequired":"1","Metric":"Tenant"})
    if(events_used + standard_events > 0):
        services.append({"ServiceName":"SAP Integration Suite, advanced event mesh, 250","BlocksRequired":"1","Metric":"Tenant"})
    if(file_storage_required or file_storage_suggested):
        services.append({"ServiceName":"SAP Cloud Platform Document Management, integration option","BlocksRequired":str(SIZING["doc_calls"][_storage_tier(stats)]),"Metric":"API Call"})
    if(isAutomation(__basic_analysis)):
        services.extend([
            {"ServiceName": "SAP Build Process Automation, advanced", "BlocksRequired": "3", "Metric": "Active User"},
            {"ServiceName": "SAP Build Process Automation, standard", "BlocksRequired": "15", "Metric": "Active User"},
            {"ServiceName": "SAP Build Process Automation, unattended automations", "BlocksRequired": "2", "Metric": "Connection"},
            {"ServiceName": "SAP Build Process Automation, attended automations", "BlocksRequired": "1", "Metric": "Connection"}
        ])
        
    return services

#------------------------------------------- Get Build (Low-code)
def getLowCodeEnv(complete_analysis:dict) -> list:
    services = []
    if not complete_analysis: return services

    stats = extractEssentials(complete_analysis)
    custom_tables = len(stats["custom_tables"])
    persistant_storage = stats["persistant_storage"]
    data_storage_required = stats["is_data_storage"]
    data_storage_suggested = stats["will_data_storage"]
    __basic_analysis = complete_analysis["basic_analysis"]

    if isAppDev(__basic_analysis):
        services.extend([
            {"ServiceName":"SAP Build Work Zone, standard edition","BlocksRequired":str(SIZING["wz_users"][_footprint_tier(stats)]),"Metric":"Active User"},
            {"ServiceName":"SAP Build Apps, enterprise edition, base package","BlocksRequired":str(SIZING["build_pkgs"][_footprint_tier(stats)]),"Metric":"Entitlements Package"}
        ])
        if not(data_storage_required or data_storage_suggested or (custom_tables>0 and persistant_storage)): 
            services.append({"ServiceName":"SAP HANA Cloud","BlocksRequired":str(SIZING["hana_cu"][_storage_tier(stats)]),"Metric":"Capacity Unit"})
    return services

#------------------------------------------- Get RAP/CAP (Pro-code)
def getProCodeEnv(complete_analysis:dict, skillset:str) -> list:
    services = []
    if not complete_analysis: return services

    stats = extractEssentials(complete_analysis)
    custom_tables = len(stats["custom_tables"])
    persistant_storage = stats["persistant_storage"]
    data_storage_required = stats["is_data_storage"]
    data_storage_suggested = stats["will_data_storage"]
    __basic_analysis = complete_analysis["basic_analysis"]
    
    if isAppDev(__basic_analysis):
        if(skillset.lower() == "abap"):
            # RAP
            services.extend([
                {"ServiceName":"SAP BTP ABAP environment","BlocksRequired":str(SIZING["abap_hours"][_footprint_tier(stats)]),"Metric":"Hours of Runtime Memory in 16 GB Blocks"},
                {"ServiceName":"SAP Build Work Zone, standard edition","BlocksRequired":str(SIZING["wz_users"][_footprint_tier(stats)]),"Metric":"Active User"}
            ])
        else:
            # CAP
            services.extend([
                {"ServiceName":"SAP Business Technology Platform, Cloud Foundry runtime","BlocksRequired":str(SIZING["cf_gb"][_footprint_tier(stats)]),"Metric":"Gigabyte"},
                {"ServiceName":"SAP Build Work Zone, standard edition","BlocksRequired":str(SIZING["wz_users"][_footprint_tier(stats)]),"Metric":"Active User"},
                {"ServiceName":"SAP Business Application Studio","BlocksRequired":"4","Metric":"User"}
            ])
            if not(data_storage_required or data_storage_suggested or (custom_tables>0 and persistant_storage)): 
                services.append({"ServiceName":"SAP HANA Cloud","BlocksRequired":str(SIZING["hana_cu"][_storage_tier(stats)]),"Metric":"Capacity Unit"})
    return services

#------------------------------------------- Skillset applicability
# Skillset picks the BTP dev stack (RAP vs CAP), so it only means anything when
# something is actually built on BTP. Retire builds nothing; on-stack stays in the
# ABAP stack by definition, so a NodeJS preference cannot apply there.
SKILLSET_APPROACHES = {"hybrid", "side-by-side"}


def skillsetApplies(complete_analysis: dict) -> bool:
    approach = ((complete_analysis or {}).get("basic_analysis", {})
                .get("RecommendedApproach") or "").lower()
    return approach in SKILLSET_APPROACHES


def _effectiveSkillset(complete_analysis: dict, skillset: str) -> str:
    if skillsetApplies(complete_analysis): return skillset
    # On-stack is RAP on the ABAP environment regardless of team preference.
    return "abap"


#------------------------------------------- Get Development approach
def getDevelopmentApproach(complete_analysis: dict, skillset: str) -> list:
    approach = ""
    if not complete_analysis: return approach

    effective = _effectiveSkillset(complete_analysis, skillset)
    if checkBuildCondition(complete_analysis): approach = "Low-Code: SAP Build"
    else:
        if(effective.lower() == "abap"): approach = "Pro-Code: RAP (RESTful Application Programming Model)"
        else: approach = "Pro-Code: CAP (Cloud Application Programming Model)"

    return approach

#------------------------------------------- Get Development services
def getDevelopmentServices(complete_analysis: dict, skillset: str) -> list:
    services = []
    if not complete_analysis: return services

    effective = _effectiveSkillset(complete_analysis, skillset)
    if checkBuildCondition(complete_analysis): services.extend(getLowCodeEnv(complete_analysis))
    else: services.extend(getProCodeEnv(complete_analysis, effective))

    return services

#------------------------------------------- Get Question and Answer uesr inputs for estimation of services
def getAnswerValue(qna, question_name) -> str | int:
    answer = next((item.get('answer', 0) for item in qna if item.get('question') == question_name), 0)
    if isinstance(answer, str) and answer.strip().isdigit(): return int(answer)    
    return answer or 0

def getCustomServices(qna: list, analysis: dict = None) -> list:
    """Map answered sizing questions to BTP services.

    Preferred path: the prebaked, AI-generated questions in
    analysis.basic_analysis.EstimateQuestions carry their own service tag
    (ServiceName + Metric + QuantityPerUnit), so mapping is deterministic and
    needs no hardcoded question text. Falls back to the legacy fixed-question
    mapping for analyses produced before question-tagging existed."""
    if not qna: return []

    questions = []
    if analysis:
        ba = analysis.get("basic_analysis") or {}
        questions = ba.get("EstimateQuestions") or []

    if questions:
        by_text = {str(q.get("Question", "")).strip(): q for q in questions if q.get("Question")}
        agg = {}  # (ServiceName, Metric) -> summed blocks
        for item in qna:
            q = by_text.get(str(item.get("question", "")).strip())
            if not q:
                continue
            ans = item.get("answer", 0)
            if isinstance(ans, str):
                ans = int(ans) if ans.strip().isdigit() else 0
            if not isinstance(ans, (int, float)) or ans <= 0:
                continue
            try:
                blocks = int(round(float(ans) * float(q.get("QuantityPerUnit", 1) or 1)))
            except (TypeError, ValueError):
                continue
            if blocks <= 0:
                continue
            svc = str(q.get("ServiceName", "")).strip()
            if not svc:
                continue
            key = (svc, str(q.get("Metric", "")).strip())
            agg[key] = agg.get(key, 0) + blocks
        return [{"ServiceName": s, "BlocksRequired": f"{b}", "Metric": m} for (s, m), b in agg.items()]

    return _legacyCustomServices(qna)


def _legacyCustomServices(qna: list) -> list:
    services=[]
    if not qna: return services

    total_web_users = getAnswerValue(qna, "What is the total number of web-based users?")
    total_mobile_users = getAnswerValue(qna, "What is the total number of mobile-based users?")
    total_approvers_app = getAnswerValue(qna, "What is total number approvers required for application?")
    total_approvers_auto = getAnswerValue(qna, "What is total number approvers required for automation?")
    total_unattended = getAnswerValue(qna, "How many unattended bots are required?")
    total_attended = getAnswerValue(qna, "How many attended bots are required?")
    total_autodevs = getAnswerValue(qna, "How many automation developers will be allocated to this initiative?")

    total_approvers = total_approvers_app + total_approvers_auto

    if(isinstance(total_web_users, int) and total_web_users>0): 
        services.append({"ServiceName":"SAP Build Work Zone, standard edition","BlocksRequired":f"{total_web_users}","Metric":"Active User"})
    if(isinstance(total_mobile_users, int) and total_mobile_users>0):
        services.append({"ServiceName":"SAP Mobile Services","BlocksRequired":f"{total_mobile_users}","Metric":"Resource"})
    if(isinstance(total_approvers, int) and total_approvers>0):
        services.append({"ServiceName":"SAP Build Process Automation, standard","BlocksRequired":f"{total_approvers}","Metric":"Active User"})
    if(isinstance(total_unattended, int) and total_unattended>0):
        services.append({"ServiceName":"SAP Build Process Automation, unattended automations","BlocksRequired":f"{total_unattended}","Metric":"Connection"})
    if(isinstance(total_attended, int) and total_attended>0):
        services.append({"ServiceName":"SAP Build Process Automation, attended automations","BlocksRequired":f"{total_attended}","Metric":"Connection"})
    if(isinstance(total_autodevs, int) and total_autodevs>0):
        services.append({"ServiceName":"SAP Build Process Automation, advanced","BlocksRequired":f"{total_autodevs}","Metric":"Active User"})
    
    return services

#------------------------------------------- Get Pricing of services
from modules.data_initializers import pricelist
from difflib import get_close_matches

def estimateServicePricing(services: list) -> list:
    if not services: return []
    available_services = pricelist["ITEM"].unique()

    def find_best_match(service_name): return next(iter(get_close_matches(service_name, available_services, n=1, cutoff=0.9)), None)

    def match_price(service_name: str, metric: str, quantity: int):
        rows = pricelist[(pricelist["ITEM"] == service_name) & (pricelist["METRICS"] == metric)]
        for _, row in rows.iterrows():
            if int(row["VOLUME_FROM"]) <= quantity <= int(row["VOLUME_TO"]):
                return {
                    "UnitPrice": float(row["PRICE_PER_UNIT"]),
                    "Price": round(float(row["PRICE_PER_UNIT"]) * quantity, 2),
                    "Currency": row["CURRENCY"],
                    "ServiceID": str(row["ITEMCODE"]),
                }
        return None

    special_cases = {
        "SAP Cloud Platform Document Management, repository option": lambda _: 1,
        "SAP Forms Service by Adobe": lambda _: 1,
        "SAP Cloud Platform Document Management, integration option": lambda blocks: blocks / 50000,
        # "SAP BTP ABAP environment": lambda _: 1,
    }

    for item in services:
        if not isinstance(item, dict): continue
        try:
            service_name = item.get("ServiceName", "")
            metric = item.get("Metric", "")
            blocks = int(item.get("BlocksRequired", 0))
            quantity = special_cases.get(service_name, lambda x: x)(blocks)
            if (matched_name := find_best_match(service_name)):
                price_details = match_price(matched_name, metric, quantity)
                item.update(price_details or {"ServiceID": None, "UnitPrice": None, "Price": "Standard Pricing", "Currency": None})
            else: item.update({"ServiceID": None, "UnitPrice": None, "Price": "Standard Pricing", "Currency": None})
        except Exception as e: item.update({"ServiceID": None, "UnitPrice": None, "Price": None, "Currency": None})

    return services

