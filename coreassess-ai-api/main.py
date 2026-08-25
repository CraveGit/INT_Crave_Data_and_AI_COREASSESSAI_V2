import os
import threading
from collections import deque

from fastapi import FastAPI, UploadFile, File, Header
from fastapi.responses import StreamingResponse, PlainTextResponse
from fastapi.exceptions import RequestValidationError

from errors import ApiError, handle_api, handle_validation, handle_unexpected
from schemas import (AnalyzeRequest, DocExportRequest, ChatRequest,
                     DocFromResponseRequest, EstimateServicesRequest,
                     DEFAULT_SKILLSET)
from modules.logsetup import getLogger
from modules.helpers import analyzeCode, enhanceAnalysis, removeComments, addCustomServicesPricing, isStandardSapObject
from genai import (setModelOverride, listDeployedModels, resolveModel,
                   setUsageSink, DEFAULT_MODEL)
from modules.usage import newUsageSink, computeCost
from docsuite import generator as doc

from contextlib import contextmanager

logger = getLogger(__name__)


# Applies a request's model choice for the duration of the call, then restores it.
@contextmanager
def useModel(model: str | None):
    setModelOverride(model)
    try: yield
    finally: setModelOverride(None)


# Collects token usage for one docgen request. The sink is a plain dict so the
# section thread-pool (copy_context) accumulates into the same object.
@contextmanager
def trackUsage():
    sink = newUsageSink()
    setUsageSink(sink)
    try: yield sink
    finally: setUsageSink(None)

LOG_FILE = "Run.log"
LOG_ADMIN_TOKEN = os.getenv("LOG_ADMIN_TOKEN")  # if set, /logs requires X-Log-Token


def _check_log_auth(token):
    if LOG_ADMIN_TOKEN and token != LOG_ADMIN_TOKEN:
        raise ApiError("forbidden", "invalid log token", 403)

# Cap concurrent heavy analyses per worker. Each /analyze fans out to ~6 LLM
# sub-threads (analyzeCode + enhanceAnalysis); without this gate a burst would
# multiply into hundreds of parallel AI Core calls -> 429s / OOM.
_analyze_gate = threading.Semaphore(int(os.getenv("MAX_CONCURRENT_ANALYSIS", "4")))

app = FastAPI(title="CoreAssess API")
app.add_exception_handler(ApiError, handle_api)
app.add_exception_handler(RequestValidationError, handle_validation)
app.add_exception_handler(Exception, handle_unexpected)

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _download(buf, filename, usage=None):
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if usage:
        # A docx body cannot carry JSON, so usage rides in headers for the caller to persist.
        headers["X-Usage-Total-Tokens"] = str(usage.get("total_tokens", 0))
        headers["X-Usage-Cost-Usd"] = str(usage.get("cost_usd", 0))
        headers["X-Usage-Llm-Calls"] = str(usage.get("llm_calls", 0))
        headers["Access-Control-Expose-Headers"] = (
            "Content-Disposition, X-Usage-Total-Tokens, X-Usage-Cost-Usd, X-Usage-Llm-Calls")
    return StreamingResponse(buf, media_type=DOCX, headers=headers)


# CAP sends null when the SkillSet lookup misses (empty table / bad ID). Falling
# through silently used to yield ABAP, i.e. a RAP recommendation nobody chose.
def _skillOf(skillset) -> str:
    name = (skillset or {}).get("Name")
    if not name:
        logger.warning(f"E-SKILLSET-missing; defaulting to {DEFAULT_SKILLSET}")
        return DEFAULT_SKILLSET
    return name


def _run_analysis(code, name, skill):
    # First gate: standard SAP objects are not customer code, so there is nothing
    # to assess for clean core -- skip before spending any LLM call.
    if isStandardSapObject(name, code):
        raise ApiError("standard_sap_object",
                       f"'{name}' is a standard SAP object; skipped (only custom Z/Y code is analysed)",
                       422)
    # MCP is the sole source of truth for Fiori/API grounding (no CSV fallback).
    # If it is enabled but unreachable, fail the object up front rather than spend
    # ~6 LLM calls and emit ungrounded results.
    from modules.grounding import MCP_ENABLED, mcpUp
    if MCP_ENABLED and not mcpUp():
        raise ApiError("mcp_unavailable",
                       "SAP grounding service (MCP) is unavailable; analysis aborted. Please retry once it is back.",
                       503)
    # Gate the LLM fan-out; queues excess requests instead of overloading AI Core.
    with _analyze_gate:
        code = removeComments(code)
        raw = analyzeCode(code, name)
        if not raw:
            raise ApiError("analysis_failed", "analysis could not complete", 502)
        result = enhanceAnalysis(name, code, raw, skill)
        if not result:
            raise ApiError("analysis_failed", "enhancement could not complete", 502)
        return result


@app.get("/")
def root():
    return {"status": "ok"}


def _err(e):
    return f"down: {str(e)[:120]}"


def _check_hana():
    from modules.conn import connectHANAdb
    from sqlalchemy import text
    eng = connectHANAdb()
    with eng.connect() as c:
        c.execute(text("SELECT 1 FROM DUMMY"))
    return "up"


def _check_aicore():
    # Lightweight metadata call proves auth + reachability.
    from ai_core_sdk.ai_core_v2_client import AICoreV2Client
    client = AICoreV2Client.from_env()
    n = len(client.model.query().resources or [])
    return f"up ({n} models)"


def _check_refdata():
    from modules.data_initializers import LOAD_ERRORS, TABLE_PREFIX
    if LOAD_ERRORS:
        return f"down: prefix {TABLE_PREFIX} missing {', '.join(LOAD_ERRORS)}"
    return f"up (prefix {TABLE_PREFIX})"


def _check_mcp():
    from modules.grounding import MCP_ENABLED, MCP_URL
    if not MCP_ENABLED:
        return "disabled"
    import anyio
    from fastmcp import Client

    async def _ping():
        async with Client(MCP_URL) as c:
            await c.list_tools()
    anyio.run(_ping)
    return "up"


@app.get("/health")
def health():
    # Deep check: each dependency probed independently; one failure doesn't mask others.
    checks = {}
    for name, fn in (("hana", _check_hana), ("refdata", _check_refdata),
                     ("aicore", _check_aicore), ("mcp", _check_mcp)):
        try:
            checks[name] = fn()
        except Exception as e:
            checks[name] = _err(e)
    # MCP "disabled" is not a failure; only "down:" prefixes are.
    degraded = any(v.startswith("down") for v in checks.values())
    return {"status": "degraded" if degraded else "ok", "checks": checks}


@app.get("/logs")
def logs_view(lines: int = 200, x_log_token: str = Header(default=None)):
    _check_log_auth(x_log_token)
    if not os.path.exists(LOG_FILE):
        return PlainTextResponse("", media_type="text/plain")
    lines = max(1, min(lines, 5000))
    with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
        tail = deque(f, maxlen=lines)
    return PlainTextResponse("".join(tail), media_type="text/plain")


@app.delete("/logs")
def logs_clear(x_log_token: str = Header(default=None)):
    _check_log_auth(x_log_token)
    open(LOG_FILE, "w").close()  # truncate
    return {"status": "cleared"}


@app.get("/models")
def models():
    # Feeds the CAPM model dropdown.
    return {"default": DEFAULT_MODEL, "models": listDeployedModels()}


@app.post("/pricing/refresh")
def pricing_refresh(dry_run: bool = True, x_log_token: str = Header(default=None)):
    # Guarded by the same admin token as /logs; dry_run reports the delta only.
    _check_log_auth(x_log_token)
    from modules.pricing import refresh
    from modules.conn import connectHANAdb, schema
    return refresh(engine=connectHANAdb(), schema=schema, dry_run=dry_run)


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.abap_object.strip():
        raise ApiError("empty_input", "abap_object required")
    with useModel(req.model):
        return _run_analysis(req.abap_object, req.ObjectName, _skillOf(req.SkillSet))


@app.post("/estimateservices")
def estimate_services(req: EstimateServicesRequest):
    if not req.analysis:
        raise ApiError("empty_input", "analysis required")
    with useModel(req.model):
        return addCustomServicesPricing(req.analysis, req.qna)


@app.post("/analyze/files")
async def analyze_files(files: list[UploadFile] = File(...), model: str = None):
    if not files:
        raise ApiError("empty_input", "files required")
    code = ""
    for f in files:
        code += (await f.read()).decode("utf-8", errors="ignore") + "\n"
    with useModel(model):
        return _run_analysis(code, files[0].filename, "ABAP")


@app.post("/docs/export")
def docs_export(req: DocExportRequest):
    if not req.analysis:
        raise ApiError("empty_input", "analysis required")
    with useModel(req.model), trackUsage() as usage:
        buf, name = doc.generate_document(req.docType, req.objectName, req.CompanyName,
                                          req.ProjectName, req.analysis, req.prompt)
    return _download(buf, name, computeCost(usage))


@app.post("/docs/chat")
def docs_chat(req: ChatRequest):
    if not req.analysis:
        raise ApiError("empty_input", "analysis required")
    with useModel(req.model), trackUsage() as usage:
        if req.chat_prompt:
            verdict = doc.chat_relevance(req.docType, req.chat_prompt)
            if not verdict.get("relevance"):
                # Non-modify query. If it is also unrelated to the document/SAP,
                # return a deterministic refusal instead of the model's free-form
                # reply (hard guardrail against off-topic prompts). in_scope defaults
                # to True so genuine questions about the doc are never blocked.
                if not verdict.get("in_scope", True):
                    title, _ = doc.DOC_TITLES.get(req.docType, doc.DOC_TITLES["FSD"])
                    refusal = (f"That request is outside the scope of this assistant. "
                               f"I can only help with the {title} for this SAP object.")
                    return {"relevance": False, "response": f"<p>{refusal}</p>",
                            "usage": computeCost(usage)}
                # In-scope question: answer it grounded in the analysis + current
                # document (the verdict's own reply has no document context).
                answer = doc.answer_question(req.docType, req.analysis, req.chat_prompt,
                                             current_doc=req.current_doc)
                return {"relevance": False, "response": answer,
                        "usage": computeCost(usage)}
        # Deep mode: use the cached spec if the caller sent one, else extract it from
        # the ABAP source once. Returned to the caller so it can be cached and reused
        # on regenerate/refine (extraction is the slow part).
        deep_spec = req.deep_spec
        if req.deep and not deep_spec and req.source:
            deep_spec = doc.extract_spec(req.source)
        html = doc.generate_chat(req.analysis, req.objectName, req.CompanyName, req.ProjectName,
                                 req.docType, req.chat_prompt, req.history, deep_spec=deep_spec,
                                 current_doc=req.current_doc)
    return {"relevance": True, "response": html, "usage": computeCost(usage), "deep_spec": deep_spec}


@app.post("/docs/from-response")
def docs_from_response(req: DocFromResponseRequest):
    if not req.analysis or not req.last_response:
        raise ApiError("empty_input", "analysis and last_response required")
    with useModel(req.model), trackUsage() as usage:
        buf, name = doc.generate_doc_from_response(req.docType, req.objectName, req.CompanyName,
                                                   req.ProjectName, req.analysis, req.last_response)
    return _download(buf, name, computeCost(usage))
