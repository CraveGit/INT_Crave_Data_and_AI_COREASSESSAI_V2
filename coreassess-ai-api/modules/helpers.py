import os
from contextvars import copy_context

from modules.logsetup import getLogger

logger = getLogger(__name__)

# Local debug dumps. Off by default: on CF the content/ dir is not shipped and the
# filesystem is ephemeral, so an unconditional write crashed every analysis.
DEBUG_DUMP_DIR = os.getenv("DEBUG_DUMP_DIR")


def _dumpDebug(filename: str, payload) -> None:
    if not DEBUG_DUMP_DIR: return
    import json
    try:
        os.makedirs(DEBUG_DUMP_DIR, exist_ok=True)
        with open(os.path.join(DEBUG_DUMP_DIR, filename), "w", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, indent=4, default=str))
    except OSError as e:
        logger.warning(f"E-DEBUG-dump {filename} failed: {e}")


# Token accounting and cost live in modules.usage so docsuite can record usage
# without importing this module. Aliases keep the existing call sites unchanged.
from modules.usage import (newUsageSink, extractUsage, recordUsage, computeCost,
                           loadModelCosts)

_new_usage_sink = newUsageSink
_extract_usage = extractUsage
_load_model_costs = loadModelCosts

# Token budgeting for the AI Core Claude deployment.
# The deployment's context window is shared by input + output, so max_tokens
# (output) is sized dynamically = window - estimated_input - safety margin,
# clamped to a sane output range. Prevents input+output overflow on large ABAP
# while allowing generous output for small objects. ~4 chars/token heuristic.
# The AI Core deployment is Claude Opus 4.8 (see genai.DEFAULT_MODEL), which
# supports up to 64k output tokens. 16384 was still truncating the S4 section on
# large objects (e.g. payroll posting reports) mid-JSON -> unparseable -> the whole
# /analyze 502'd. 32000 gives headroom while staying well inside the 200k window.
ANALYSIS_CONTEXT_WINDOW = int(os.getenv("ANALYSIS_CONTEXT_WINDOW", "200000"))
ANALYSIS_MAX_OUTPUT     = int(os.getenv("ANALYSIS_MAX_OUTPUT", "32000"))
ANALYSIS_MIN_OUTPUT     = int(os.getenv("ANALYSIS_MIN_OUTPUT", "2048"))
ANALYSIS_SAFETY_MARGIN  = 1500

def _dynamic_max_tokens(*text_parts: str) -> int:
    est_input = sum(len(t or "") for t in text_parts) // 4
    budget = ANALYSIS_CONTEXT_WINDOW - est_input - ANALYSIS_SAFETY_MARGIN
    return max(ANALYSIS_MIN_OUTPUT, min(ANALYSIS_MAX_OUTPUT, budget))

#------------------------------------------- Analyze input code/data for input prompt object
from dotenv import load_dotenv
load_dotenv()
from genai import buildLlm, resolveModel, DEFAULT_MODEL

# Per-task model tiers. A request-level override (CAPM dropdown -> /analyze "model")
# wins over these; see genai.resolveModel.
# - BASIC/S4/TECHNICAL  -> reasoning models: deepest, SAP-accurate analysis.
# - INTERFACE/CDS/RETIRE_CHECK -> gpt-4o: moderate reasoning.
# - RELIST_TABLES/QUALITY_SCORING -> gpt-4o-mini: cheap/fast, mechanical extraction.
ANALYSIS_MODEL = DEFAULT_MODEL
MODEL_BY_TYPE = {
    "BASIC":           os.getenv("MODEL_BASIC",     DEFAULT_MODEL),
    "S4":              os.getenv("MODEL_S4",        DEFAULT_MODEL),
    "TECHNICAL":       os.getenv("MODEL_TECHNICAL", DEFAULT_MODEL),
    "INTERFACE":       os.getenv("MODEL_INTERFACE", "gpt-4o"),
    "CDS":             os.getenv("MODEL_CDS",       "gpt-4o"),
    "RETIRE_CHECK":    os.getenv("MODEL_RETIRE",    "gpt-4o"),
    "RELIST_TABLES":   os.getenv("MODEL_RELIST",    "gpt-4o-mini"),
    "QUALITY_SCORING": os.getenv("MODEL_QUALITY",   "gpt-4o-mini"),
}

# True when an OBJECT NAME is in the customer namespace (Z/Y prefix, possibly
# behind a program-type prefix like SAPM/CL_, or a registered /namespace/).
def _isCustomName(name):
    import re
    n = (name or "").strip().upper()
    if not n:
        return None  # unknown
    if re.match(r'^/\w+/', n):
        return True
    core = re.sub(r'^(SAPM|SAPL|SAPF|SAPU|SAPD|CL_|IF_|FUGR_|FUNC_)', '', n)
    return core[:1] in ("Z", "Y") or n[:1] in ("Z", "Y")


# The object's OWN declared name, parsed from the source. This is authoritative:
# a standard object whose folder was renamed to Z still declares its real
# (standard) name here, so content wins over the file name.
def _declaredObjectName(code):
    import re
    if not code:
        return None
    m = re.search(r'^\s*(?:REPORT|PROGRAM|FUNCTION-POOL)\s+([\w/]+)', code, re.IGNORECASE | re.MULTILINE)
    if m:
        return m.group(1)
    m = re.search(r'^\s*(?:CLASS|INTERFACE)\s+([\w/]+)\s+DEFINITION', code, re.IGNORECASE | re.MULTILINE)
    if m:
        return m.group(1)
    return None


# Standard-SAP detector. Only customer code (Z/Y namespace or a registered
# /namespace/) is worth a clean-core assessment; everything else is SAP standard
# and is skipped before any LLM call. The declared name in the code is trusted
# over the folder/file name, so standard code renamed to "Z..." is still skipped.
def isStandardSapObject(name, code=""):
    declared = _declaredObjectName(code)
    if declared is not None:
        declaredCustom = _isCustomName(declared)
        if declaredCustom is not None:
            return not declaredCustom  # skip when the declared object is standard
    nameCustom = _isCustomName(name)
    if nameCustom is None:
        return False  # nothing to judge on -> analyse rather than wrongly skip
    return not nameCustom


def removeComments(code_object):
    clean_lines = []
    for line in code_object.splitlines():
        stripped_line = line.strip()
        if stripped_line.startswith('*') or stripped_line.startswith('"'):
            continue
        if '"' in line:
            line = line.split('"', 1)[0]
        clean_lines.append(line.rstrip())
    cleaned_code = '\n'.join(clean_lines)
    return cleaned_code

def analyzeBatch(prompt_data: dict, code_object: str, object_name: str = "", directive: str = "", usage_sink: dict = None):
    prompt_message, prompt_type = prompt_data["message"], prompt_data["type"]

    # Object-focus guard: the input concatenates ALL source files of the object's
    # folder, which often includes dumped source of the STANDARD SAP FMs/BAPIs the
    # object merely calls. Naming the target object prevents the model from
    # analysing a called standard FM instead of the custom object itself.
    focus = ""
    if object_name and prompt_type in ('BASIC', 'S4', 'TECHNICAL', 'INTERFACE', 'RETIRE_CHECK'):
        focus = (
            f"The object under analysis is '{object_name}'. Analyze ONLY this custom object. "
            f"The input may also contain source of STANDARD SAP function modules/BAPIs it calls "
            f"(e.g. names starting with BAPI_ or standard SAP FMs) — treat those strictly as called "
            f"dependencies, never as the object itself.\n\n"
        )

    if(prompt_type=='CDS'): input_message = f"Suggest S/4 cds views/tables for these standard tables:\n{code_object}"
    elif(prompt_type=='RELIST_TABLES'): input_message = f"Categorize these tables:\n{code_object}"
    elif(prompt_type in ['BASIC','S4','TECHNICAL','INTERFACE','RETIRE_CHECK']): input_message = f"{focus}{directive}ABAP Object:\n{code_object}"
    else: input_message = code_object

    messages = [{"role": "system", "content": prompt_message}, {"role": "user", "content": input_message}]
    max_out = _dynamic_max_tokens(prompt_message, input_message)
    if max_out <= ANALYSIS_MIN_OUTPUT:
        logger.warning(f"e0f14: large input for {prompt_type}; output capped at {max_out} tokens")
    model_name = resolveModel(task_default=MODEL_BY_TYPE.get(prompt_type, ANALYSIS_MODEL))
    try:
        llm = buildLlm(model_name, max_tokens=max_out)

        _msg = llm.invoke(messages)
        response = _msg.content
        recordUsage(usage_sink, model_name, _msg)
        if not response: raise ValueError(f"Empty model response")
        return response
    except Exception as e:
        if hasattr(e, 'code') and e.code == 'context_length_exceeded':
            new_code_object = removeComments(code_object)
            if len(new_code_object) >= len(code_object)-10: logger.error(f"e0f12: {e}")
            else: return analyzeBatch(prompt_data, new_code_object, object_name, directive, usage_sink)
        elif hasattr(e, 'code') and e.code == 'DeploymentNotFound': logger.error(f"e0f13: {e}")
        else: logger.error(f"e0f11: {e}")
        return None
    
#------------------------------------------- Parse string input to  json object
import json

def _repairTruncatedJson(response: str):
    """Best-effort salvage of JSON that was cut off mid-stream (model hit the
    output-token cap). Collects every position that could be a clean truncation
    boundary (after a completed value, closing bracket, or comma) and, from the
    latest boundary backwards, closes the open brackets and tries to parse. The
    first that parses wins -- recovering whatever fields completed before the cut
    so one oversized section degrades gracefully instead of failing the object."""
    if not response: return None
    start = response.find('{')
    if start == -1: return None
    s = response[start:]
    in_str = esc = False
    boundaries = []   # exclusive indices where a clean cut may be possible
    for i, ch in enumerate(s):
        if in_str:
            if esc: esc = False
            elif ch == '\\': esc = True
            elif ch == '"': in_str = False; boundaries.append(i + 1)
            continue
        if ch == '"': in_str = True
        elif ch in '}],': boundaries.append(i + 1)
    # Try the longest kept prefix first; cap attempts so a pathological response
    # can't spin. A dangling "key" (no value) simply fails and we fall back.
    for cut in reversed(boundaries[-200:]):
        head = s[:cut].rstrip()
        if head.endswith(','): head = head[:-1]
        stack = []
        in_str = esc = False
        for ch in head:
            if in_str:
                if esc: esc = False
                elif ch == '\\': esc = True
                elif ch == '"': in_str = False
                continue
            if ch == '"': in_str = True
            elif ch == '{': stack.append('}')
            elif ch == '[': stack.append(']')
            elif ch in '}]':
                if stack: stack.pop()
        candidate = head + ''.join(reversed(stack))
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and parsed: return parsed
        except Exception: continue
    return None

def parseResponse(response: str):
    if not response: return None
    import re as _re
    text = response.strip()

    # Strip markdown code fences (```json ... ```) that Claude/LLMs often add
    if text.startswith("```"):
        text = _re.sub(r"^```[A-Za-z0-9]*\s*", "", text)
        text = _re.sub(r"\s*```$", "", text).strip()

    try: return json.loads(text)
    except json.JSONDecodeError: pass

    # Slice to the outermost JSON object if wrapped in prose
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = text[start:end + 1]
        try: return json.loads(candidate)
        except json.JSONDecodeError: text = candidate

    # Last resort: escape raw newlines inside strings, then strip stray newlines
    def escape_multiline_string(m):
        return m.group(0).replace('\n', '\\n')
    fixed_response = _re.sub(r'"(?:[^"\\]|\\.)*"', escape_multiline_string, text)
    fixed_response = _re.sub(r'(?<!\\)\n', '', fixed_response)

    try: return json.loads(fixed_response)
    except Exception: pass

    # Final fallback: the response was likely truncated at the output-token cap
    # (mid-string / mid-array). Salvage the fields that completed before the cut.
    salvaged = _repairTruncatedJson(response)
    if isinstance(salvaged, dict) and salvaged:
        logger.warning(f"e0p11: recovered truncated LLM response ({len(salvaged)} keys); "
                       f"raise ANALYSIS_MAX_OUTPUT if this recurs")
        return salvaged

    logger.error(f"e0p10: unparseable LLM response (first 200): {str(response)[:200]}")
    return None

#------------------------------------------- Check if object is interface
def isInterface(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "interface" in [item.lower() for item in parsed_basic_analysis.get("WRICEFObjectType", [])]: return True
    return False
#------------------------------------------- Check if object is report
def isReport(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "report" in [item.lower() for item in parsed_basic_analysis.get("WRICEFObjectType", [])]: return True
    return False
#------------------------------------------- Check if object is enhancement
def isEnhancement(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "enhancement" in [item.lower() for item in parsed_basic_analysis.get("WRICEFObjectType", [])]: return True
    return False
#------------------------------------------- Check if use case is integration
def isIntegration(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "integration" in [item.lower() for item in parsed_basic_analysis.get("UseCaseArea", [])]: return True
    return False
#------------------------------------------- Check if use case is automation
def isAutomation(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "automation" in [item.lower() for item in parsed_basic_analysis.get("UseCaseArea", [])]: return True
    return False
#------------------------------------------- Check if use case is app dev
def isAppDev(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if "application development" in [item.lower() for item in parsed_basic_analysis.get("UseCaseArea", [])]: return True
    return False
#------------------------------------------- Check if use case is data analytics
def isDataAnalytics(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    # The prompt asks for "Data and Analytics"; this matched only "data analytics",
    # so the check never fired and analytics objects lost their BTP services and
    # effort uplift. Accept both spellings.
    areas = [str(item).lower() for item in parsed_basic_analysis.get("UseCaseArea", [])]
    return any(a in ("data analytics", "data and analytics") for a in areas)
#------------------------------------------- Check if use case is app dev and automation
def isAppDevAutomation(parsed_basic_analysis: dict):
    if(not parsed_basic_analysis): return False
    if(isAppDev(parsed_basic_analysis) and isAutomation(parsed_basic_analysis)): return True
    return False

#------------------------------------------- Check if object is interface
def successParsing(filename: str, analysis: dict, analysis_type: str):
    if not analysis or not isinstance(analysis, dict):
        logger.error(f"e1f11:[{filename}] {analysis_type} analysis could not be completed. Skipping further analysis.")
        return False
    # print(f"{filename}: passed {analysis_type}")
    return True

#------------------------------------------- Batch analysis of the code
from modules.prompts import basic_analysis, highlvl_s4_analysis, technical_analysis, interface_analysis

def analyzeCode(code_object: str, filename: str):
    print(f"Started analyzing {filename}")
    usage = _new_usage_sink()   # accumulates tokens across all LLM calls for this object
    output_basic_analysis = analyzeBatch(basic_analysis, code_object, filename, usage_sink=usage)
    parsed_basic_analysis = parseResponse(output_basic_analysis)
    if not successParsing(filename, parsed_basic_analysis, "_Basic"): return

    # Deterministic pre-approach so S4/technical/interface recommendations are
    # tailored to the target approach (on-stack/retire -> no SAP BTP side-by-side).
    try:
        _facts = extractFacts(code_object, {"basic_analysis": parsed_basic_analysis, "technical_analysis": {"IntegrationAnalysis": {}}})
        _approach, _ = decideApproach(_facts)
        _a = str(_approach).lower()
        if _a in ("on-stack", "on stack", "onstack", "retire"):
            directive = (
                f"Migration approach for this object: {_approach}.\n"
                f"HARD CONSTRAINT: This is an ON-STACK / RETIRE object. It stays entirely on the ABAP stack. "
                f"Do NOT recommend, suggest, mention, or imply moving, migrating, re-platforming, extending, or "
                f"building anything on SAP BTP (no BTP ABAP Environment, no BTP side-by-side, no Integration Suite, "
                f"no Event Mesh, no BTP extensibility). Do NOT include the 'Extensibility and Customization Using "
                f"SAP BTP' or 'Leverage BTP ABAP Environment for Extensions' items. The word 'BTP' must not appear "
                f"in any recommendation. Recommend ONLY on-stack techniques: ABAP Cloud / RAP, released BAdIs and "
                f"enhancement spots, CDS views, embedded analytics / SAC, and standard released S/4 apps and APIs.\n\n")
        else:
            directive = (f"Migration approach for this object: {_approach}. Strictly honor the APPROACH DIRECTIVE "
                         f"in the instructions. For hybrid, consume released standard S/4 (CDS/OData/Fiori) from the "
                         f"stack and keep only custom business logic/UI on SAP BTP. For side-by-side, all custom on "
                         f"SAP BTP.\n\n")
    except Exception:
        directive = ""

    # S4, TECHNICAL and INTERFACE are independent of each other (all key off BASIC
    # + code + directive) -> run concurrently. They also hit different model
    # deployments (Sonnet / gpt-5 / gpt-4o), so this is genuine parallelism.
    from concurrent.futures import ThreadPoolExecutor
    is_intf = isInterface(parsed_basic_analysis)
    # copy_context: ContextVars (the request's model override) do not propagate
    # into pool threads on their own.
    with ThreadPoolExecutor(max_workers=3) as _ex:
        f_s4   = _ex.submit(copy_context().run, analyzeBatch, highlvl_s4_analysis, code_object, filename, directive, usage)
        f_tech = _ex.submit(copy_context().run, analyzeBatch, technical_analysis, code_object, filename, directive, usage)
        f_intf = _ex.submit(copy_context().run, analyzeBatch, interface_analysis, code_object, filename, directive, usage) if is_intf else None
        output_s4_analysis = f_s4.result()
        output_technical_analysis = f_tech.result()
        output_interface_analysis = f_intf.result() if f_intf else '{"IDocs": [],"StandardAPIs": [],"Events": [],"StandardEvents": [],"IntegrationModernization": ""}'

    parsed_s4_analysis = parseResponse(output_s4_analysis)
    if not successParsing(filename, parsed_s4_analysis, "_S4"): return

    parsed_technical_analysis = parseResponse(output_technical_analysis)
    if not successParsing(filename, parsed_technical_analysis, "_Technical"): return

    parsed_interface_analysis = parseResponse(output_interface_analysis)
    if not successParsing(filename, parsed_interface_analysis, "_Interface"): return

    complete_analysis = {
        "basic_analysis": parsed_basic_analysis,
        "highlvl_s4_analysis": parsed_s4_analysis,
        "technical_analysis": parsed_technical_analysis,
        "interface_analysis": parsed_interface_analysis
    }
    complete_analysis["TokenUsage"] = usage   # carried into enhanceAnalysis to keep accumulating

    missing_keys = [key for key in complete_analysis if not complete_analysis[key]]
    if missing_keys: return logger.error(f"e1f12: Analysis is missing keys: {missing_keys}")
    return complete_analysis

#------------------------------------------- Get value and typecase
def get_value(dictionary, key, cast_func=lambda x: x):
    try: 
        if cast_func == bool: return str(dictionary[key]).lower() in {"true", "1"}
        return cast_func(dictionary[key])
    except: 
        if cast_func == str: return ""
        elif cast_func == list: return []
        elif cast_func == dict: return {}
        elif cast_func == int: return 0
        return None

#------------------------------------------- Extract essential fields from analysis
def extractEssentials(complete_analysis: dict):          
    __basic_analysis = complete_analysis["basic_analysis"]
    __integration_analysis = complete_analysis["technical_analysis"]["IntegrationAnalysis"]
    __interface_analysis = complete_analysis["interface_analysis"]
    return {
        "sap_module": get_value(__basic_analysis, "SAPModule"),
        "wricef_type": get_value(__basic_analysis, "WRICEFObjectType", list),
        "usecase_area": get_value(__basic_analysis, "UseCaseArea", list),
        "codelength": get_value(__basic_analysis, "CodeLength", int),
        "custom_tables": get_value(__basic_analysis, "CustomTables", list),
        "standard_tables": get_value(__basic_analysis, "StandardTables", list),
        "bapis": get_value(__basic_analysis, "BAPIs", list),
        "function_modules": get_value(__basic_analysis, "FunctionModules", list),
        "events": get_value(__interface_analysis, "Events", list),
        "standard_events": get_value(__interface_analysis, "StandardEvents", list),
        "screens_count": get_value(__basic_analysis, "ScreensUsed", int),
        "ui_fields_count": get_value(__basic_analysis, "FieldsOnScreens", int),
        "reports_complexity": get_value(__basic_analysis, "ReportsComplexity", int),
        "workflows_count": get_value(__basic_analysis, "WorkflowsUsed", int),
        "workflows_complexity": get_value(__basic_analysis, "WorkflowsComplexity", int),
        "forms_count": get_value(__basic_analysis, "FormsUsed", int),
        "excel_upload": get_value(__basic_analysis, "ExcelUpload", lambda x: bool(int(x))),
        "bdcs_count": get_value(__basic_analysis, "BDCUsed", int),
        "validations": get_value(__basic_analysis, "Validations", bool),
        "crud_ops": set(map(str.lower, get_value(__basic_analysis, "CRUD", list) or [])),
        "persistant_storage": get_value(__basic_analysis, "PersistantDataStorage", bool),
        "will_data_storage": get_value(__basic_analysis, "WillDataStorage", bool),
        "is_data_storage": get_value(__basic_analysis, "IsDataStorage", bool),
        "is_file_storage": get_value(__basic_analysis, "IsFileStorage", bool),
        "will_file_storage": get_value(__basic_analysis, "WillFileStorage", bool),
        "is_analytical_report": get_value(__basic_analysis, "IsAnalyticsReport", bool),
        "ui_intgr": get_value(__integration_analysis, "UIIntegration", bool),
        "thirdparty_intgr": get_value(__integration_analysis, "ThirdPartyIntegration", bool),
    }

#------------------------------------------- Enhancement 1: Code length
def addCodeLines(code_object: str, complete_analysis: dict):
    lines = code_object.splitlines()
    code_lines = 0
    for line in lines:
        stripped_line = line.strip()                
        if stripped_line and not stripped_line.startswith("*"): code_lines += 1
    complete_analysis["basic_analysis"]["CodeLength"] = str(code_lines)
    # TokenSize is no longer asked from the LLM (redundant vs real TokenUsage).
    # Kept as "0" to satisfy the CAPM-mapped TOKEN_SIZE column until CAPM payload is updated.
    complete_analysis["basic_analysis"]["TokenSize"] = "0"
    # print(f'--- Added code lines: {str(code_lines)}')
    return complete_analysis

#------------------------------------------- Enhancement 2: Coupling & approach (deterministic decision map)
from modules.decisions import extractFacts, decideApproach, evaluateCleanCore, ApproachRules

def addCoupling(complete_analysis: dict, code_object: str = ""):
    """Deterministic approach/adherence/coupling from the clean-core rule engine."""
    ba = complete_analysis["basic_analysis"]
    verdict = evaluateCleanCore(code_object, complete_analysis)

    ba["Coupling"] = verdict.coupling.value
    ba["RecommendedApproach"] = verdict.approach.value
    ba["RecommendedApproachReason"] = verdict.approach_reason
    ba["CleanCoreAdherence"] = verdict.adherence.value
    ba["AdherenceReason"] = verdict.adherence_reason
    # SAP Extensibility Classification Level (A-D): current (as-is) and target
    # (clean-core ceiling after the recommended approach), each with justification.
    ba["CleanCoreTier"] = verdict.tier.value
    ba["CleanCoreTierReason"] = verdict.tier_reason
    ba["CleanCoreTargetTier"] = verdict.target_tier.value
    ba["CleanCoreTargetTierReason"] = verdict.target_tier_reason
    ba["DecisionFacts"] = verdict.facts
    ba["CleanCoreViolations"] = [v.model_dump() for v in verdict.violations]

    # The engine is the SINGLE approach decider. checkRetire ran earlier and stashed
    # the retire narrative + FunctionalitiesMap under highlvl_s4_analysis; surface it
    # into basic_analysis ONLY when the engine actually chose retire, so approach and
    # its retire fields never disagree. (Previously checkRetire flipped the approach
    # itself, but it ran AFTER this engine call, so the engine never saw the map and
    # its retire branch was unreachable.)
    s4 = complete_analysis.get("highlvl_s4_analysis") or {}
    if verdict.approach.value == "retire":
        expl = (s4.get("RetireExplanation") or "").strip()
        addon = "Hence, this specific program can be retired and reimplemented using suggested standard Fiori apps."
        ba["RetireExplanation"] = (expl + " " + addon).strip() if expl else addon
        ba["Reimplementation"] = s4.get("Reimplementation") or ""
        ba["FunctionalitiesMap"] = s4.get("FunctionalitiesMap") or []
        ba["UseCaseArea"] = []
        ba["UseCaseAreaExplanation"] = ""
    else:
        ba["RetireExplanation"] = ""
        ba["Reimplementation"] = ""
        ba["FunctionalitiesMap"] = []
    return complete_analysis

#------------------------------------------- Enhancement 2b: Ground API/Fiori recs vs live SAP catalogs (MCP)
from modules.grounding import groundApis, groundFioriApps, groundCds

def groundRecommendations(complete_analysis: dict):
    """Best-effort grounding of LLM-suggested standard APIs against the live SAP
    API Hub (via axiom MCP). Drops only confirmed-missing (404) APIs, annotates
    the rest with a VERIFIED/UNVERIFIED provenance list. Adds NEW *_verified keys
    only; never changes existing keys/types. Never raises."""
    if not complete_analysis: return complete_analysis
    try:
        s4 = complete_analysis.get("highlvl_s4_analysis", {})
        apis = s4.get("SAPStandardAPIs", []) or []
        if apis:
            kept, prov = groundApis(apis)
            s4["SAPStandardAPIs"] = kept
            s4["SAPStandardAPIs_verified"] = prov

        intf = complete_analysis.get("interface_analysis", {})
        iapis = intf.get("StandardAPIs", []) or []
        if iapis:
            kept2, prov2 = groundApis(iapis)
            intf["StandardAPIs"] = kept2
            intf["StandardAPIs_verified"] = prov2

        sql = complete_analysis.get("technical_analysis", {}).get("SQLAnalysis", {})
        s4t = sql.get("S4Tables", []) or []
        if s4t:
            sql["S4Tables_verified"] = groundCds(s4t)
    except Exception as e:
        logger.error(f"e1g10: grounding skipped: {e}")
    return complete_analysis

#------------------------------------------- Enhancement 3: Fiori apps Ids
def addFioriAppId(complete_analysis: dict):
    """Resolve LLM-suggested Fiori app names to 'FIORI_ID (Title)' against the LIVE
    SAP Fiori Apps Reference Library via MCP ONLY. The offline REF_FIORIAPPS table
    is stale and is no longer used (per requirement: MCP is the source of truth).
    If MCP is disabled/unreachable, names are left as-is rather than resolved from
    stale data."""
    if(not complete_analysis): return complete_analysis
    fiori_apps_input = complete_analysis.get("highlvl_s4_analysis", {}).get("SAPStandardFioriApps", [])
    if(fiori_apps_input):
        try:
            from modules.grounding import groundFioriApps, MCP_ENABLED
            if MCP_ENABLED:
                grounded, _prov = groundFioriApps(fiori_apps_input)
                if grounded:
                    complete_analysis["highlvl_s4_analysis"]["SAPStandardFioriApps"] = grounded
            else:
                logger.warning("e1g22: MCP disabled; Fiori app IDs not resolved (CSV fallback removed)")
        except Exception as e:
            logger.error(f"e1g20: MCP Fiori grounding failed; leaving names unresolved: {e}")
    # print(f'--- Added {len(complete_analysis["highlvl_s4_analysis"]["SAPStandardFioriApps"])} Fiori apps')
    return complete_analysis

#------------------------------------------- Enhancement 4: CDS views
from modules.prompts import cds_recommendation

def addCDSViews(filename: str, complete_analysis: dict, precomputed=None):
    if(not complete_analysis): return complete_analysis
    tables_used = list(set(complete_analysis["basic_analysis"]["CustomTables"]+complete_analysis["basic_analysis"]["StandardTables"]))
    if(tables_used):
        new_s4_views = precomputed if precomputed is not None else analyzeBatch(cds_recommendation, tables_used)
        parsed_s4_views = parseResponse(new_s4_views)
        if not successParsing(filename, parsed_s4_views, "_CDS"): 
            print(f'--x Failed to add CDS views')
            return
        complete_analysis["technical_analysis"]["SQLAnalysis"]["S4Tables"] = parsed_s4_views["S4Tables"]
    # print(f'--- Added {len(complete_analysis["technical_analysis"]["SQLAnalysis"]["S4Tables"])} CDS views')
    return complete_analysis

#------------------------------------------- Enhancement 5: Implementation efforts
from modules.effort_estimators import getEstHours, getTShirtSize

def addEfforts(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    est_efforts = getEstHours(complete_analysis)
    tshirt_size = getTShirtSize(est_efforts)
    complete_analysis["basic_analysis"]["ManEfforts"] = str(sum(est_efforts.values()) - est_efforts["code_hours"])
    complete_analysis["basic_analysis"]["TShirtSize"] = tshirt_size
    # print(f'--- Added efforts hours: {complete_analysis["basic_analysis"]["ManEfforts"]}')
    # print(f'--- Added tshirt size: {complete_analysis["basic_analysis"]["TShirtSize"]}')
    return complete_analysis

#------------------------------------------- Enhancement 6: Implementation priority
from modules.effort_estimators import getPriority

def addPriority(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    priority = getPriority(complete_analysis)
    complete_analysis["basic_analysis"]["Priority"] = priority
    # print(f'--- Added priority: {complete_analysis["basic_analysis"]["Priority"]}')
    return complete_analysis

#------------------------------------------- Enhancement 7: Basic BTP services
from modules.service_estimators import getBasicServices, getDevelopmentApproach, getDevelopmentServices, estimateServicePricing

def addDevelopmentApproach(complete_analysis: dict, skillset: str):
    approach = getDevelopmentApproach(complete_analysis, skillset)
    complete_analysis["technical_analysis"]["DevelopmentApproach"] = approach
    # print(f'--- Added Development approach: {complete_analysis["technical_analysis"]["DevelopmentApproach"]}')

    return complete_analysis

def addBasicServices(complete_analysis: dict, skillset: str):
    if(not complete_analysis): return complete_analysis
    basic_services = getBasicServices(complete_analysis) or []
    development_services = getDevelopmentServices(complete_analysis, skillset) or []
    all_basic_services = basic_services + development_services

    complete_analysis["technical_analysis"]["BTPServices"] = all_basic_services
    # print(f'--- Added {len(complete_analysis["technical_analysis"]["BTPServices"])} basic BTP services')

    return complete_analysis

#------------------------------------------- Enhancement 8: Basic BTP services pricing
def addBasicServicesPricing(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    services = complete_analysis["technical_analysis"]["BTPServices"] or []
    services_pricing = estimateServicePricing(services)
    complete_analysis["technical_analysis"]["BTPServices"] = services_pricing
    # print(f'--- Added {len(complete_analysis["technical_analysis"]["BTPServices"])} basic BTP services with pricing')
    return complete_analysis

#------------------------------------------- Additional Enhancement 1: Custom BTP services and pricing
from modules.service_estimators import getCustomServices

def addCustomServicesPricing(complete_analysis: dict, qna: list):
    if(not complete_analysis): return complete_analysis
    # Pass the analysis so getCustomServices can use the prebaked question tags
    # (ServiceName/Metric/QuantityPerUnit) for a deterministic answer->service map.
    services = getCustomServices(qna, complete_analysis)
    services_pricing = estimateServicePricing(services)
    return services_pricing

#------------------------------------------- Additional Enhancement 2: Custom BTP services and pricing
from modules.effort_estimators import quantifyMigrationEfforts

def addMigrationEfforts(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    total_hours = quantifyMigrationEfforts(complete_analysis)
    coupling = complete_analysis["basic_analysis"]["Coupling"]

    if coupling.lower()=="loose": 
        complete_analysis["basic_analysis"]["ManEfforts"] = str(total_hours)
        complete_analysis["basic_analysis"]["TShirtSize"] = getTShirtSize(total_hours)
    # print(f'--- Added migration efforts hours: {complete_analysis["basic_analysis"]["ManEfforts"]}')
    # print(f'--- Updated tshirt size: {complete_analysis["basic_analysis"]["TShirtSize"]}')
    
    return complete_analysis

#------------------------------------------- Additional Enhancement 3: Clear irrelevant recommendations
def filterRecommendations(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    # .get with defaults: a salvaged (truncated) S4 section may lack these keys.
    s4 = complete_analysis.setdefault("highlvl_s4_analysis", {})
    s4recommendations = s4.get("S4Recommendations") or []
    s4.setdefault("S4Recommendations", s4recommendations)
    coupling = complete_analysis["basic_analysis"]["Coupling"]
    usecase_areas = complete_analysis["basic_analysis"]["UseCaseArea"]
    filtered_recommendations = s4recommendations
    
    if coupling.lower() == "loose":
        complete_analysis["highlvl_s4_analysis"]["SAPStandardFioriApps"] = []

    # on-stack (tight) and retire must NOT carry SAP BTP side-by-side content.
    if coupling.lower() in ("tight", "retire"):
        def _has_btp(x):
            t = str(x or "").lower()
            return "btp" in t or "side-by-side" in t or "side by side" in t
        ta = complete_analysis["technical_analysis"]
        filtered_recommendations = [i for i in filtered_recommendations
                                    if i.get("Title") != "Extensibility and Customization Using SAP BTP"
                                    and not _has_btp(i.get("Title")) and not _has_btp(i.get("Description"))]
        ta["BTPServices"] = []
        ta["CleanCoreAnalysis"] = [i for i in ta.get("CleanCoreAnalysis", [])
                                   if not _has_btp(i.get("Title")) and not _has_btp(i.get("Description"))]
        integ = ta.get("IntegrationAnalysis", {})
        integ["IntegrationResult"] = [i for i in integ.get("IntegrationResult", [])
                                      if not _has_btp(i.get("Title")) and not _has_btp(i.get("Description"))]
        complete_analysis["basic_analysis"]["UseCaseArea"] = []
        complete_analysis["basic_analysis"]["UseCaseAreaExplanation"] = ""
        ta["DevelopmentApproach"] = ""
    if not any("integration" in item.lower() for item in usecase_areas):
        filtered_recommendations = [item for item in filtered_recommendations if item["Title"] != "Integration and Interface Management"]
        
    complete_analysis["highlvl_s4_analysis"]["S4Recommendations"] = filtered_recommendations

    # print(f'--- Cleared irrelevant recommendations (if any): {len(s4recommendations)} -> {len(complete_analysis["highlvl_s4_analysis"]["S4Recommendations"])}')
    return complete_analysis

#------------------------------------------- Additional Enhancement 4: Extend implementation efforts
from modules.effort_estimators import getExtendedEfforts, applyEffortFactors
def addExtendedEfforts(complete_analysis: dict):
    if(not complete_analysis): return complete_analysis
    efforts_breakdown = getExtendedEfforts(complete_analysis)
    extended_hours = int(efforts_breakdown["total_hours"])
    complete_analysis["basic_analysis"]["ManEfforts"] = str(extended_hours)
    complete_analysis["basic_analysis"]["TShirtSize"] = getTShirtSize(extended_hours/2)
    # print(f'--- Updated efforts: {complete_analysis["basic_analysis"]["ManEfforts"]}')
    # print(f'--- Updated tshirt size(re): {complete_analysis["basic_analysis"]["TShirtSize"]}')
    return complete_analysis

#------------------------------------------- Final: scope-based effort estimate
from modules.sizing import inventoryFromAnalysis, estimateForApproach, APPROACH_SCOPE


def addScopedEfforts(complete_analysis: dict):
    """Replace the additive estimate with a build-scope one, and publish the
    per-approach comparison the UI needs. Never fatal: on failure the earlier
    ManEfforts value is left untouched."""
    if not complete_analysis: return complete_analysis
    ba = complete_analysis.get("basic_analysis") or {}
    try:
        inventory = inventoryFromAnalysis(complete_analysis)
        approach = (ba.get("RecommendedApproach") or "side-by-side").lower()

        options = {}
        for name in APPROACH_SCOPE:
            estimate = estimateForApproach(inventory, name)
            options[name] = {
                "total_hours": estimate.total_hours,
                "total_days": estimate.total_days,
                "build_hours": estimate.build_hours,
                "build_days": estimate.build_days,
                "logic_hours": estimate.logic_hours,
                "logic_days": estimate.logic_days,
                "design_hours": estimate.design_hours,
                "design_days": estimate.design_days,
                "test_hours": estimate.test_hours,
                "test_days": estimate.test_days,
                "deploy_hours": estimate.deploy_hours,
                "deploy_days": estimate.deploy_days,
                "pm_hours": estimate.pm_hours,
                "pm_days": estimate.pm_days,
            }

        chosen = estimateForApproach(inventory, approach)
        hours = int(round(chosen.total_hours))
        # ManEfforts stays HOURS: existing CAP/UI consumers depend on it.
        ba["ManEfforts"] = str(hours)
        ba["ManEffortsDays"] = chosen.total_days
        ba["HoursPerDay"] = chosen.hours_per_day
        ba["TShirtSize"] = getTShirtSize(hours)
        ba["EffortBreakdown"] = chosen.model_dump()
        ba["EffortBreakdown"]["approach"] = approach
        ba["EffortByApproach"] = options
        complete_analysis["basic_analysis"] = ba
    except Exception as e:
        logger.error(f"E-SIZING-scoped estimate failed: {e}")
    return complete_analysis

#------------------------------------------- Additional Enhancement 5: Re-list standard and custom tables
import re
from modules.prompts import relist_tables_prompt

def relistTables(filename: str, code_object: str, complete_analysis: dict):
    ai_standard_tables = complete_analysis["basic_analysis"]["StandardTables"]
    ai_custom_tables = complete_analysis["basic_analysis"]["CustomTables"]

    patterns = [
        r'\bUPDATE\s+(\w+)',
        r'\bMODIFY\s+(\w+)',
        r'\bFROM\s+(\w+)',
        r'\bTYPE\s+STANDARD\s+TABLE\s+OF\s+(\w+)'
    ]

    table_names = set()
    matching_lines = []

    for line in code_object.splitlines():
        for pattern in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                matches = re.findall(pattern, line, re.IGNORECASE)
                table_names.update(matches)
                matching_lines.append(line.strip())
                break
    # with open("./content/raw_tables.txt", "w") as file:
    #     file.write("\n".join(matching_lines))

    relist_tables = analyzeBatch(relist_tables_prompt, table_names)
    parsed_relist_tables = parseResponse(relist_tables)

    if not successParsing(filename, parsed_relist_tables, "_CDS"): 
        # print(f'--x Failed to add CDS views')
        return
    
    complete_analysis["basic_analysis"]["StandardTables"] = parsed_relist_tables["StandardTables"]
    complete_analysis["basic_analysis"]["CustomTables"] = parsed_relist_tables["CustomTables"]
    complete_analysis["basic_analysis"]["StandardTables_AI"] = ai_standard_tables
    complete_analysis["basic_analysis"]["CustomTables_AI"] = ai_custom_tables

    # print(f'--- Added {len(complete_analysis["basic_analysis"]["StandardTables"])} standard tables and {len(complete_analysis["basic_analysis"]["CustomTables"])} custom tables.')
    return complete_analysis

#------------------------------------------- Additional Enhancement 6: Retire
from modules.prompts import functionality_prompt

def checkRetire(filename: str, code_object: str, complete_analysis: dict, precomputed=None):
    """Data-only retire step: run the functionality/Fiori-replacement check and
    publish its evidence (FunctionalitiesMap, suggested Fiori apps, retire narrative)
    under highlvl_s4_analysis. It does NOT decide the approach -- the clean-core
    engine (addCoupling) owns that and reads FunctionalitiesMap. MUST run BEFORE
    addCoupling so the engine's retire branch is reachable."""
    if(not complete_analysis): return complete_analysis
    functionality_replacements = precomputed if precomputed is not None else analyzeBatch(functionality_prompt, code_object, filename)
    parsed_functionality_replacements = parseResponse(functionality_replacements)

    if not successParsing(filename, parsed_functionality_replacements, "_RETIRE_CHECK"):
        # Parse failed: leave an empty map so the engine sees "no coverage" and never
        # retires, but keep the analysis intact (returning None nuked the pipeline).
        complete_analysis.setdefault("highlvl_s4_analysis", {}).setdefault("FunctionalitiesMap", [])
        return complete_analysis

    complete_analysis.setdefault("highlvl_s4_analysis", {}).setdefault("SAPStandardFioriApps", [])
    suggested_fiori_apps = list(set([f["StandardFioriApp"] for f in parsed_functionality_replacements["Functionalities"] if f["StandardFioriApp"]]))
    complete_analysis["highlvl_s4_analysis"]["SAPStandardFioriApps"] = suggested_fiori_apps
    complete_analysis = addFioriAppId(complete_analysis)

    # Coverage evidence + retire narrative are published here; the retire THRESHOLD
    # and gates (coverage / external-consumer / functionality_count) live in ApproachRules so
    # a single rule engine owns the decision. addCoupling surfaces the narrative into
    # basic_analysis only if the engine actually picks retire.
    functionalities = parsed_functionality_replacements["Functionalities"]
    complete_analysis["highlvl_s4_analysis"]["FunctionalitiesMap"] = functionalities
    complete_analysis["highlvl_s4_analysis"]["RetireExplanation"] = parsed_functionality_replacements.get("Explanation", "")
    complete_analysis["highlvl_s4_analysis"]["Reimplementation"] = parsed_functionality_replacements.get("Reimplementation", "")

    return complete_analysis
    
#------------------------------------------- Additional Enhancement 6b: BTP sizing questions
from modules.prompts import estimate_questions_prompt

def addEstimateQuestions(complete_analysis: dict):
    """Prebake context-aware BTP sizing questions for side-by-side / hybrid objects
    and store them (tagged with their target service) on basic_analysis so the
    'BTP Services' popup renders instantly and answers map deterministically."""
    if(not complete_analysis): return complete_analysis
    ba = complete_analysis.get("basic_analysis") or {}
    approach = str(ba.get("RecommendedApproach") or "").lower()
    # Only side-by-side / hybrid objects get BTP build work, so only they need
    # sizing questions. Everything else -> no questions (no wasted LLM call).
    if approach not in ("side-by-side", "hybrid"):
        ba["EstimateQuestions"] = []
        return complete_analysis

    areas = ba.get("UseCaseArea") or []
    area_str = ", ".join(str(a) for a in areas) if isinstance(areas, list) else str(areas)
    dev = (complete_analysis.get("technical_analysis") or {}).get("DevelopmentApproach") or ""
    context = (
        f"Object: {ba.get('ObjectName') or ''}\n"
        f"Target approach: {approach}\n"
        f"Use Case Area(s): {area_str}\n"
        f"Development approach: {dev}\n"
        f"Functional description: {ba.get('FunctionalAnalysis') or ''}\n"
    )
    try:
        raw = analyzeBatch(estimate_questions_prompt, context, "", "", complete_analysis.get("TokenUsage"))
        parsed = parseResponse(raw) or {}
        questions = parsed.get("EstimateQuestions") or []
        for i, q in enumerate(questions, start=1):
            q["ID"] = i
        ba["EstimateQuestions"] = questions
    except Exception as e:
        logger.error(f"e1eq1: estimate question generation failed: {e}")
        ba["EstimateQuestions"] = []
    return complete_analysis

#------------------------------------------- Additional Enhancement 7: Code quality score
from modules.prompts import quality_scoring_prompt
import math

# The model returns JSON strings ("true"/"false"), not booleans. bool("false") is
# True, so a plain truthiness test awarded full marks for every failed check and
# every object scored exactly 100.
_TRUTHY = {"true", "yes", "y", "1"}


def _isTruthy(value) -> bool:
    if isinstance(value, bool): return value
    if isinstance(value, (int, float)): return value > 0
    return str(value).strip().lower() in _TRUTHY


def scoreParameters(parsed_scoring_response, scoring_rules, criteria_weights):
    total_score = 0
    total_possible_weight = 0
    breakdown = {}
    if not parsed_scoring_response:
        return {"TotalScore": 0, "DetailedBreakdown": breakdown, "ScoreAnalysis": parsed_scoring_response}

    for criterion, params in parsed_scoring_response.items():
        criterion_score = 0
        max_score = 0
        for flag, flag_value in params.items():
            if flag_value is None: continue
            weight = scoring_rules.get(criterion, {}).get(flag, 0)
            if weight > 0:
                max_score += weight
                if _isTruthy(flag_value): criterion_score += weight

        if max_score > 0:
            weight_factor = criteria_weights.get(criterion, 0)
            weighted_score = (criterion_score / max_score) * weight_factor
            total_score += weighted_score
            total_possible_weight += weight_factor
        else:
            weighted_score = 0

        breakdown[criterion] = {
            "RawScore": round(criterion_score, 2),
            "MaxScore": round(max_score, 2),
            "WeightedScore": round(weighted_score, 2)
        }

    normalized_total = (total_score / total_possible_weight) * 100 if total_possible_weight else 0

    return {"TotalScore": round(normalized_total, 2), "DetailedBreakdown": breakdown, "ScoreAnalysis": parsed_scoring_response}

def setQualityScore(filename, code_object, complete_analysis, precomputed=None):
    criteria_weights = {
        "CodeReadability": 18,
        "Performance": 23,
        "DatabaseAccess": 18,
        "Security": 12,
        "ErrorHandling": 12,
        "Maintainability": 17
    }

    scoring_rules = {
      "CodeReadability": {"uses_SAP_naming_conventions": 6, "has_meaningful_comments": 6, "general_modularization_present": 6 },
      "Performance": {"efficient_SELECT_statements": 8, "database_indexes_used": 8, "avoids_nested_loops": 7 },    
      "DatabaseAccess": {"uses_FOR_ALL_ENTRIES": 6, "avoids_SELECT_*": 6, "uses_INNER_JOINs_appropriately": 6},
      "Security": {"includes_authority_checks": 7, "avoids_direct_table_updates": 5},
      "ErrorHandling": {"uses_MESSAGE_statements": 6, "uses_TRY_CATCH": 6},
      "Maintainability": {"uses_object_oriented_abap": 8, "modularization_via_methods_or_classes": 9}
    }

    scoring_response = precomputed if precomputed is not None else analyzeBatch(quality_scoring_prompt, code_object, filename)
    parsed_scoring_response = parseResponse(scoring_response)
    if not successParsing(filename, parsed_scoring_response, "_QUALITY_SCORING"): 
        # print(f'--x Failed to add scoring')
        return

    score_object = scoreParameters(parsed_scoring_response, scoring_rules, criteria_weights)
    if not score_object:
        complete_analysis["basic_analysis"]["CodeQualityScore"] = "0"
        complete_analysis["basic_analysis"]["DetailedBreakdown"] = {}
        complete_analysis["basic_analysis"]["ScoreAnalysis"] = {}
        return complete_analysis
    
    final_score = score_object["TotalScore"]
    final_score_ratio = (final_score / 100) * 5
    detailed_breakdown = score_object["DetailedBreakdown"]
    score_analysis = score_object["ScoreAnalysis"]
    complete_analysis["basic_analysis"]["CodeQualityScore"] = f"{final_score}"
    complete_analysis["basic_analysis"]["CodeQualityScoreRatio"] = f"{final_score_ratio:.2f}/5"
    complete_analysis["basic_analysis"]["DetailedBreakdown"] = detailed_breakdown
    complete_analysis["basic_analysis"]["ScoreAnalysis"] = score_analysis

    # print(f'--- Added code quality score {final_score}')
    return complete_analysis

#------------------------------------------- Enhancements applied
def enhanceAnalysis(filename: str, code_object: str, complete_analysis: dict, skillset: str):
    if not complete_analysis:
        logger.error(f"e1e00:[{filename}] analysis is empty; skipping enhancement")
        return None

    # Prefetch the 3 independent enhance-stage LLM calls concurrently:
    # cds (needs basic tables), retire + quality (need code). Results are fed into
    # their normal steps below, so 3 sequential calls become one parallel batch.
    from concurrent.futures import ThreadPoolExecutor
    _ba = complete_analysis.get("basic_analysis", {})
    _usage = complete_analysis.get("TokenUsage") or _new_usage_sink()
    complete_analysis["TokenUsage"] = _usage
    _tables = list(set((_ba.get("CustomTables") or []) + (_ba.get("StandardTables") or [])))
    with ThreadPoolExecutor(max_workers=3) as _ex:
        _f_cds  = _ex.submit(copy_context().run, analyzeBatch, cds_recommendation, _tables, "", "", _usage) if _tables else None
        _f_ret  = _ex.submit(copy_context().run, analyzeBatch, functionality_prompt, code_object, filename, "", _usage)
        _f_qual = _ex.submit(copy_context().run, analyzeBatch, quality_scoring_prompt, code_object, filename, "", _usage)
        _cds_raw  = _f_cds.result() if _f_cds else None
        _ret_raw  = _f_ret.result()
        _qual_raw = _f_qual.result()

    enhancement01 = addCodeLines(code_object, complete_analysis)
    enhancement02 = addFioriAppId(enhancement01)
    enhancement03 = addCDSViews(filename, enhancement02, precomputed=_cds_raw)
    enhancement03g = groundRecommendations(enhancement03)
    # checkRetire is data-only and MUST run before addCoupling: it publishes the
    # FunctionalitiesMap that the clean-core engine reads to decide retire. Running it
    # after addCoupling (the old order) left the map empty at decision time, so the
    # engine's retire branch was unreachable and only a legacy flip could retire.
    enhancement03r = checkRetire(filename, code_object, enhancement03g, precomputed=_ret_raw)
    enhancement04 = addCoupling(enhancement03r, code_object)
    enhancement05 = addPriority(enhancement04)
    enhancement06 = filterRecommendations(enhancement05)
    # enhancement07 = relistTables(filename, code_object, enhancement06)
    enhancement09 = setQualityScore(filename, code_object, enhancement06, precomputed=_qual_raw)
    enhancement10 = addDevelopmentApproach(enhancement09, skillset)
    # Prebake BTP sizing questions (needs the final approach + development approach).
    enhancement10q = addEstimateQuestions(enhancement10)
    enhancement11 = addBasicServices(enhancement10q, skillset)
    enhancement12 = addBasicServicesPricing(enhancement11)
    # Effort runs last: it needs the FINAL approach, adherence and quality score.
    # Replaces the old addEfforts -> addMigrationEfforts -> addExtendedEfforts ->
    # applyEffortFactors chain, which summed an inventory and then discounted it.
    enhancement16 = addScopedEfforts(enhancement12)
    if enhancement16 and enhancement16.get("TokenUsage"):
        computeCost(enhancement16["TokenUsage"])   # add cost_usd + per-model breakdown
        # Expose under "usage" too: the CAP UploadObject handler persists
        # objectResponse.usage (total_tokens + cost_usd) into ASSESSMENT_USAGE.
        enhancement16["usage"] = enhancement16["TokenUsage"]

    _dumpDebug("enhanced_output.json", enhancement16)

    return enhancement16