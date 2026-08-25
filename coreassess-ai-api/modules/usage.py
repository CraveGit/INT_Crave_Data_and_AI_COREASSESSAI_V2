"""Token accounting and cost, shared by analysis and docgen.

Costs come from SAP AI Core's own metered rates (model catalog version.cost, USD
per 1000 tokens), not hardcoded public prices. Lives here rather than in helpers
so docsuite can record usage without importing the analysis pipeline.
"""
import threading

from modules.logsetup import getLogger

logger = getLogger(__name__)

_usage_lock = threading.Lock()
_MODEL_COST_CACHE = None


def newUsageSink() -> dict:
    return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0,
            "llm_calls": 0, "by_model": {}}


def extractUsage(message) -> tuple[int, int, int]:
    meta = getattr(message, "usage_metadata", None)
    if meta:
        it = int(meta.get("input_tokens", 0) or 0)
        ot = int(meta.get("output_tokens", 0) or 0)
        return it, ot, int(meta.get("total_tokens", it + ot) or (it + ot))
    resp = getattr(message, "response_metadata", None) or {}
    tu = resp.get("token_usage") or resp.get("usage") or {}
    it = int(tu.get("prompt_tokens", tu.get("input_tokens", 0)) or 0)
    ot = int(tu.get("completion_tokens", tu.get("output_tokens", 0)) or 0)
    return it, ot, (it + ot)


# Thread-safe: analysis fans out to a pool and docgen renders sections in parallel.
def recordUsage(sink: dict, model: str, message) -> None:
    if sink is None: return
    it, ot, tt = extractUsage(message)
    with _usage_lock:
        sink["input_tokens"] += it
        sink["output_tokens"] += ot
        sink["total_tokens"] += tt
        sink["llm_calls"] += 1
        entry = sink["by_model"].setdefault(model, {"input": 0, "output": 0, "calls": 0})
        entry["input"] += it; entry["output"] += ot; entry["calls"] += 1


def _parseCost(cost_list) -> dict:
    values = {}
    for entry in (cost_list or []):
        for key, value in entry.items():
            try: values[key] = float(value)
            except (TypeError, ValueError): pass
    return {"input": values.get("input_cost", 0.0), "output": values.get("output_cost", 0.0)}


def loadModelCosts() -> dict:
    global _MODEL_COST_CACHE
    if _MODEL_COST_CACHE is not None:
        return _MODEL_COST_CACHE
    costs = {}
    try:
        from ai_core_sdk.ai_core_v2_client import AICoreV2Client
        client = AICoreV2Client.from_env()
        for model in client.model.query().resources:
            versions = model.versions or []
            latest = next((v for v in versions if getattr(v, "is_latest", False)),
                          versions[0] if versions else None)
            if latest and getattr(latest, "cost", None):
                costs[model.model] = _parseCost(latest.cost)
    except Exception as e:
        logger.error(f"E-COST-catalog unavailable: {e}")
    _MODEL_COST_CACHE = costs
    return costs


# Single total per run. Per-model detail is kept internally for the priced/unpriced
# split but is not part of the returned payload.
def computeCost(usage: dict) -> dict:
    if not usage: return usage
    rates = loadModelCosts()
    total, unpriced = 0.0, []
    for model, tokens in (usage.get("by_model") or {}).items():
        rate = rates.get(model)
        if not rate:
            unpriced.append(model)
            continue
        total += ((tokens.get("input", 0) / 1000.0) * rate["input"]
                  + (tokens.get("output", 0) / 1000.0) * rate["output"])
    usage["cost_usd"] = round(total, 6)
    usage["cost_currency"] = "USD"
    if unpriced:
        # Their tokens are counted but contribute 0 to cost; surface that, do not hide it.
        usage["cost_unpriced_models"] = unpriced
        logger.warning(f"E-COST-no catalog rate for: {', '.join(unpriced)}")
    return usage
