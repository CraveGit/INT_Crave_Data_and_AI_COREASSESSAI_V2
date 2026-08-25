"""Phase 2: Ground LLM-suggested APIs / Fiori apps / CDS against live SAP
catalogs via the axiom-sap-connectors MCP.

Design rules:
- Never hard-fail the pipeline: any MCP/network error -> return the original
  LLM suggestions unchanged (best-effort grounding).
- Verification semantics for api-hub metadata:
    200 (entities returned)  -> VERIFIED (real, callable in sandbox)
    'error' contains 404     -> DROP (service does not exist)
    'error' contains 403     -> UNVERIFIED (exists in SAP, not exposed in sandbox) -> KEEP
- Adds *_verified provenance keys WITHOUT touching the original CAPM-mapped keys.
"""
from __future__ import annotations

import os
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor

from modules.logsetup import getLogger

logger = getLogger(__name__)

MCP_URL = os.getenv("AXIOM_MCP_URL", "https://ai-sap-connectors.cfapps.us10-001.hana.ondemand.com/mcp")
MCP_ENABLED = os.getenv("AXIOM_MCP_ENABLED", "true").lower() == "true"
_MCP_TIMEOUT = int(os.getenv("AXIOM_MCP_TIMEOUT", "30"))

# Extract the technical service/app token from a "NAME (Description)" string
_TOKEN = re.compile(r"^\s*([A-Za-z0-9_/]+)")


def _tech(name: str) -> str:
    m = _TOKEN.match(name or "")
    return m.group(1) if m else (name or "").strip()


async def _call(tool: str, args: dict):
    from fastmcp import Client  # imported lazily so the framework runs even if absent
    async with Client(MCP_URL) as c:
        r = await c.call_tool(tool, args)
        return r.data if hasattr(r, "data") else r


def _run(coro):
    """Run an MCP coroutine from either a sync or an async caller.

    asyncio.run() raises "cannot be called from a running event loop" when the
    caller is already on one -- which is the case for the async /analyze/files
    route (sync routes run in a threadpool and were unaffected). Detect that and
    drive the coroutine on a private loop in a separate thread.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _runBlocking(coro)      # no loop here: plain asyncio.run

    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_runBlocking, coro).result()


def _runBlocking(coro):
    try:
        return asyncio.run(asyncio.wait_for(coro, _MCP_TIMEOUT))
    except Exception as e:  # noqa: BLE001 - grounding is best-effort
        logger.warning("grounding MCP call failed: %s", e)
        return None


# Short, dedicated timeout for the pre-analysis health gate so a down MCP fails an
# object quickly instead of waiting the full grounding timeout.
_MCP_PING_TIMEOUT = int(os.getenv("AXIOM_MCP_PING_TIMEOUT", "8"))


async def _pingMcp():
    from fastmcp import Client

    async def _do():
        async with Client(MCP_URL) as c:
            await c.list_tools()
        return True
    return await asyncio.wait_for(_do(), _MCP_PING_TIMEOUT)


# True only if MCP is enabled AND the server is reachable (tools listable). Used as
# a hard precondition for analysis: grounding (Fiori/API) is MCP-sourced now, so a
# down MCP must fail the object rather than silently produce ungrounded results.
def mcpUp() -> bool:
    if not MCP_ENABLED:
        return False
    return _run(_pingMcp()) is True


# ---------------------------------------------------------------- API grounding
def verifyApi(service_name: str) -> str:
    """Return VERIFIED / UNVERIFIED / MISSING for a single API service name."""
    res = _run(_call("api-hub_get_s4_service_metadata", {"service_name": service_name}))
    if res is None:
        return "UNVERIFIED"  # MCP unreachable -> don't drop
    if isinstance(res, dict) and res.get("error"):
        err = str(res.get("error"))
        if "404" in err:
            return "MISSING"
        return "UNVERIFIED"  # 403 etc. = exists but not testable in sandbox
    if isinstance(res, dict) and res.get("entities"):
        return "VERIFIED"
    return "UNVERIFIED"


def groundApis(api_list: list[str]) -> tuple[list[str], list[dict]]:
    """Drop hallucinated (MISSING) APIs; keep VERIFIED + UNVERIFIED.
    Returns (kept_list_same_shape, provenance)."""
    if not MCP_ENABLED or not api_list:
        return api_list, []
    kept, prov = [], []
    for item in api_list:
        tech = _tech(item)
        status = verifyApi(tech)
        prov.append({"api": tech, "status": status})
        if status != "MISSING":
            kept.append(item)
    # if everything got dropped (likely MCP misbehaving), keep originals
    return (kept or api_list), prov


# -------------------------------------------------------------- Fiori grounding
def findFioriByTcode(tcode: str) -> list[dict]:
    res = _run(_call("fiori-lib_find_fiori_app_for_tcode", {"tcode": tcode}))
    return res or []


def searchFiori(query: str) -> list[dict]:
    res = _run(_call("fiori-lib_search_fiori_apps", {"query": query}))
    return res or []


_S4MAP = re.compile(r"->\s*([A-Za-z0-9_/]+)")  # "OLD -> NEW (desc)"


def groundCds(s4_tables: list[str]) -> list[dict]:
    """Best-effort provenance for suggested S/4 CDS replacements. Verifies only
    what is exposed as OData (API_* and analytical C_*_CDS); released I_* interface
    views are DDIC objects (no OData) -> reported UNVERIFIED, never dropped.
    Annotation only; does not modify the CDS list.
    NOTE: authoritative I_*/C_* validation needs a released-CDS catalog tool added
    to axiom-sap-connectors."""
    if not MCP_ENABLED or not s4_tables:
        return []
    prov = []
    for entry in s4_tables:
        m = _S4MAP.search(entry or "")
        cds = m.group(1) if m else _tech(entry)
        # Only OData-shaped names are checkable; I_* interface views are not.
        if cds.upper().startswith(("API_", "C_")) or cds.endswith("_CDS"):
            status = verifyApi(cds)
        else:
            status = "UNVERIFIED"  # I_* interface CDS not resolvable via API Hub
        prov.append({"cds": cds, "status": status})
    return prov


def groundFioriApps(app_names: list[str]) -> tuple[list[str], list[dict]]:
    """Resolve LLM-named Fiori apps to verified 'FIORI_ID (Title)' via the live
    library. Falls back to the original name if no confident match."""
    if not MCP_ENABLED or not app_names:
        return app_names, []
    out, prov = [], []
    for name in app_names:
        hits = searchFiori(name)
        best = next((h for h in hits if h.get("app_id")), None)
        if best:
            resolved = f"{best['app_id']} ({best.get('title') or name})"
            out.append(resolved)
            prov.append({"query": name, "app_id": best["app_id"], "title": best.get("title")})
        else:
            out.append(name)
            prov.append({"query": name, "app_id": None})
    # de-dup preserving order
    seen, deduped = set(), []
    for x in out:
        if x not in seen:
            seen.add(x); deduped.append(x)
    return deduped, prov
