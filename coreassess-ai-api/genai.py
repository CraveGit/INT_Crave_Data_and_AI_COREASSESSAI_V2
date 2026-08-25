import os
from contextvars import ContextVar
from ai_core_sdk.ai_core_v2_client import AICoreV2Client
from gen_ai_hub.proxy.langchain.init_models import init_llm
from gen_ai_hub.proxy.gen_ai_hub_proxy.client import GenAIHubProxyClient

from modules.logsetup import getLogger

logger = getLogger(__name__)

DEFAULT_MODEL = os.getenv("ANALYSIS_MODEL", "anthropic--claude-4.8-opus")
DOC_MODEL = os.getenv("MODEL_DOCSUITE", "gpt-4o")

# Per-request model override. ContextVar (not a global) so concurrent requests and
# the analysis thread-pool never read each other's selection.
_model_override: ContextVar[str | None] = ContextVar("model_override", default=None)

_proxy_client = None


def setModelOverride(model: str | None) -> None:
    _model_override.set(model or None)


def getModelOverride() -> str | None:
    return _model_override.get()


# Resolution order: explicit arg -> request override -> per-task default -> global default.
def resolveModel(model: str | None = None, task_default: str | None = None) -> str:
    return model or _model_override.get() or task_default or DEFAULT_MODEL


# sap-ai-sdk-gen 7.x no longer auto-configures a proxy client; init_llm fails with
# 'NoneType' object has no attribute 'deployment_class' unless one is passed.
def getProxyClient() -> GenAIHubProxyClient:
    global _proxy_client
    if _proxy_client is None:
        _proxy_client = GenAIHubProxyClient(ai_core_client=AICoreV2Client.from_env())
    return _proxy_client


# Non-chat deployments (embeddings, rerankers) share the resource group but cannot
# serve analysis or docgen; offering them would fail at invoke time.
NON_CHAT_MARKERS = ("embedding", "embed-", "rerank", "whisper", "tts", "dall-e",
                    "stable-diffusion", "moderation")

# Models whose MAX OUTPUT is too small for analysis / docgen, which request up to
# 32k output (refine) / 16k (deep) / 8k (sections). Selecting one would error
# mid-generation, so they are hidden from the pickable list. Substring match on the
# deployment name; env-overridable. NOTE: kept SPECIFIC so large-output models are
# NOT caught -- e.g. GPT-5, GPT-4.1 and Claude 4.x must remain selectable, only the
# small-window families (gpt-4o/gpt-4/gpt-3.5, claude-3.x, *-mini, *-flash) are cut.
LOW_OUTPUT_MARKERS = tuple(
    m.strip().lower() for m in os.getenv(
        "DOC_INCOMPATIBLE_MODELS",
        "gpt-4o,gpt-4-,gpt-4.0,gpt-35,gpt-3.5,gpt-4-32k,claude-3-,claude-3.5,"
        "gemini-1,-flash,-mini,o1-mini,text-,titan"
    ).split(",") if m.strip()
)


def _isChatModel(name: str) -> bool:
    lowered = name.lower()
    return not any(marker in lowered for marker in NON_CHAT_MARKERS)


def _hasEnoughOutput(name: str) -> bool:
    lowered = name.lower()
    return not any(marker in lowered for marker in LOW_OUTPUT_MARKERS)


# Live from AI Core, not a curated list: whatever is deployed in the resource group
# is what the UI can pick, minus models that cannot do chat OR whose output window
# is too small for analysis/docgen (would error mid-run).
def listDeployedModels() -> list[str]:
    try:
        names = {d.model_name for d in getProxyClient().deployments if d.model_name}
        return sorted(n for n in names if _isChatModel(n) and _hasEnoughOutput(n))
    except Exception as e:
        logger.error(f"E-MODELS-deployment query failed: {e}")
        return []


# sap-ai-sdk-gen forces temperature/top_p into model_kwargs. Newer Anthropic models
# reject them ("temperature is deprecated", "temperature and top_p cannot both be
# specified"), so strip them after construction.
# NOTE: BotoConfig(read_timeout) is rejected in 7.x ("Object of type Config is not
# JSON serializable"); the SDK owns the Bedrock client now.
def buildLlm(model: str | None = None, max_tokens: int = 4096, task_default: str | None = None):
    name = resolveModel(model, task_default)
    llm = init_llm(name, proxy_client=getProxyClient(), max_tokens=max_tokens)
    model_kwargs = getattr(llm, "model_kwargs", None)
    if isinstance(model_kwargs, dict):
        model_kwargs.pop("temperature", None)
        model_kwargs.pop("top_p", None)
    return llm


def llm(model=None, temperature=0, max_tokens=4096):
    return buildLlm(model, max_tokens=max_tokens, task_default=DOC_MODEL)


# Per-request usage sink for docgen. A ContextVar (copied into the section pool via
# copy_context) so parallel sections of one document accumulate into the same sink
# while concurrent requests stay isolated.
_usage_sink: ContextVar[dict | None] = ContextVar("doc_usage_sink", default=None)


def setUsageSink(sink: dict | None) -> None:
    _usage_sink.set(sink)


def getUsageSink() -> dict | None:
    return _usage_sink.get()


def complete(system, user, model=None, max_tokens=4096):
    from modules.usage import recordUsage
    name = resolveModel(model, DOC_MODEL)
    m = buildLlm(name, max_tokens=max_tokens)
    r = m.invoke([{"role": "system", "content": system}, {"role": "user", "content": user}])
    recordUsage(_usage_sink.get(), name, r)
    return (r.content or "").strip()
