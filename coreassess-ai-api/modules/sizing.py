"""Effort model: build-scope sizing rather than inventory counting.

The previous model summed one flat figure per dimension (tables + FMs + screens +
forms + ...), doubled the result, then discounted by approach. A read-heavy report
that touched many objects therefore scored on every axis at once and landed near
300h on-stack, where the real work is a CDS view and a Fiori Elements list.

This model instead asks what has to be BUILT:
  1. a driver is only in scope if the chosen approach actually rebuilds it
  2. repeated artefacts of the same kind get a sub-linear (learning-curve) rate
  3. lifecycle overhead is a declared multiplier, not an arbitrary x2
"""
import os

from pydantic import BaseModel, Field

from modules.logsetup import getLogger

logger = getLogger(__name__)

# Person-days are the unit estimates get discussed in; hours stay authoritative and
# days are derived, so the two can never disagree.
try:
    HOURS_PER_DAY = float(os.getenv("HOURS_PER_PERSON_DAY", "8"))
    if HOURS_PER_DAY <= 0: raise ValueError("must be positive")
except ValueError as e:
    logger.error(f"E-SIZING-bad HOURS_PER_PERSON_DAY ({e}); using 8")
    HOURS_PER_DAY = 8.0


def toDays(hours: float) -> float:
    return round(hours / HOURS_PER_DAY, 2)

# Hours for the FIRST artefact of each kind. Subsequent ones decay (see DECAY).
# Grounded in the legacy CONFIG bands, re-expressed per-artefact instead of per-band.
BASE_HOURS = {
    "table":       6.0,    # a custom table: definition, migration, auth
    "cds_view":    4.0,    # a released-CDS consumption view
    "api_call":    5.0,    # calling one released API / BAPI replacement
    "screen":      12.0,   # one UI view
    "form":        24.0,   # one print/Adobe form
    "workflow":    24.0,   # one workflow definition
    "bdc":         10.0,   # one BDC/batch-input conversion
    "integration": 24.0,   # one external interface
    "report":      10.0,   # one report/ALV output
}

# Each additional artefact of the same kind costs less: the pattern is established
# after the first. rate(n) = BASE * (1 + sum(DECAY^i for i in 1..n-1)).
DECAY = 0.55

# Cap per kind so a pathological inventory cannot dominate the estimate.
MAX_UNITS = {"table": 12, "cds_view": 12, "api_call": 12, "screen": 10,
             "form": 6, "workflow": 6, "bdc": 8, "integration": 6, "report": 8}

# What each approach actually rebuilds. Drivers absent here contribute nothing.
# retire       : nothing is built; effort is decommissioning + validation
# on-stack     : reuse standard tables via released CDS; build views/logic/UI in ABAP Cloud
# hybrid       : consume standard data through APIs; build logic + UI on BTP
# side-by-side : rebuild the full stack on BTP
APPROACH_SCOPE = {
    "retire":       {"table": 0.0, "cds_view": 0.0, "api_call": 0.15, "screen": 0.0,
                     "form": 0.0, "workflow": 0.0, "bdc": 0.0, "integration": 0.1,
                     "report": 0.0},
    "on-stack":     {"table": 0.2, "cds_view": 1.0, "api_call": 0.5, "screen": 0.6,
                     "form": 0.5, "workflow": 0.7, "bdc": 0.4, "integration": 0.7,
                     "report": 0.6},
    "hybrid":       {"table": 0.4, "cds_view": 0.7, "api_call": 1.0, "screen": 1.0,
                     "form": 0.8, "workflow": 0.9, "bdc": 0.6, "integration": 1.0,
                     "report": 0.8},
    "side-by-side": {"table": 1.0, "cds_view": 0.5, "api_call": 1.0, "screen": 1.0,
                     "form": 1.0, "workflow": 1.0, "bdc": 1.0, "integration": 1.0,
                     "report": 1.0},
}

# Complexity of the logic itself, independent of how many objects it touches.
# Derived from code size; this is the part that genuinely scales with the program.
LOGIC_HOURS = {"low": 16.0, "medium": 40.0, "high": 80.0}

# How much of the LEGACY logic actually has to be re-implemented. On-stack keeps
# the business rules but expresses them in released CDS + a thin ABAP Cloud layer,
# so legacy LOC overstates the new build. Retire re-implements almost nothing.
LOGIC_REBUILD = {"retire": 0.1, "on-stack": 0.45, "hybrid": 0.75, "side-by-side": 1.0}

# Lifecycle uplift on top of build. Declared explicitly instead of an implicit x2.
# Retire is validation-heavy but build-light, so it carries its own profile.
LIFECYCLE = {"design": 0.15, "test": 0.30, "deploy": 0.10, "pm": 0.10}
LIFECYCLE_RETIRE = {"design": 0.10, "test": 0.45, "deploy": 0.15, "pm": 0.10}

ADHERENCE_DEBT = {"none": 1.25, "partial": 1.10, "full": 1.0}
MIN_HOURS = 8.0


class EffortDrivers(BaseModel):
    """Counted artefacts plus the qualitative signals that scale them."""
    tables: int = 0
    cds_views: int = 0
    api_calls: int = 0
    screens: int = 0
    forms: int = 0
    workflows: int = 0
    bdcs: int = 0
    integrations: int = 0
    reports: int = 0
    code_lines: int = 0
    logic_complexity: str = "medium"
    adherence: str = "partial"
    quality_score: float = 100.0


class ObjectInventory(BaseModel):
    """What the LEGACY object contains, straight from the analysis."""
    custom_tables: int = 0
    standard_tables: int = 0
    bapis_fms: int = 0
    screens: int = 0
    forms: int = 0
    workflows: int = 0
    bdcs: int = 0
    integrations: int = 0
    reports: int = 0
    code_lines: int = 0
    logic_complexity: str = "medium"
    adherence: str = "partial"
    quality_score: float = 100.0
    has_ui: bool = True


class EffortBreakdown(BaseModel):
    build_hours: float = 0.0
    logic_hours: float = 0.0
    design_hours: float = 0.0
    test_hours: float = 0.0
    deploy_hours: float = 0.0
    pm_hours: float = 0.0
    total_hours: float = 0.0
    build_days: float = 0.0
    logic_days: float = 0.0
    design_days: float = 0.0
    test_days: float = 0.0
    deploy_days: float = 0.0
    pm_days: float = 0.0
    total_days: float = 0.0
    hours_per_day: float = HOURS_PER_DAY
    drivers: dict = Field(default_factory=dict)
    factors: dict = Field(default_factory=dict)


# Sub-linear: the 10th table of the same shape is not the 1st table's work.
def unitHours(kind: str, count: int) -> float:
    if count <= 0: return 0.0
    base = BASE_HOURS.get(kind, 0.0)
    capped = min(count, MAX_UNITS.get(kind, count))
    total = base
    for i in range(1, capped):
        total += base * (DECAY ** i)
    return total


def _logicBand(drivers: EffortDrivers) -> str:
    band = (drivers.logic_complexity or "medium").lower()
    if band in LOGIC_HOURS: return band
    lines = drivers.code_lines or 0
    return "low" if lines <= 1000 else "medium" if lines <= 5000 else "high"


_QUALITY_RE = None


# Maps the analysis JSON onto the inventory. Kept here so the model has one entry
# point and callers never hand-assemble drivers.
def inventoryFromAnalysis(analysis: dict) -> ObjectInventory:
    global _QUALITY_RE
    if _QUALITY_RE is None:
        import re
        _QUALITY_RE = re.compile(r"[^0-9.]")

    from modules.helpers import extractEssentials
    stats = extractEssentials(analysis)
    basic = (analysis or {}).get("basic_analysis", {}) or {}

    try:
        raw = str(basic.get("CodeQualityScore", "") or "")
        quality = float(_QUALITY_RE.sub("", raw) or 100)
    except ValueError:
        quality = 100.0

    lines = stats["codelength"] or 0
    by_size = "low" if lines <= 1000 else "medium" if lines <= 5000 else "high"

    # LOC alone understates dense logic: a 550-line dialog program with overlapping
    # date validation and authorisation rules is not "low". Take the higher of the
    # size-derived band and the model's own LogicComplexity judgement.
    ORDER = {"low": 0, "medium": 1, "high": 2}
    stated = str(basic.get("LogicComplexity") or "").strip().lower()
    band = by_size
    if stated in ORDER and ORDER[stated] > ORDER[by_size]:
        band = stated

    return ObjectInventory(
        custom_tables=len(stats["custom_tables"]),
        standard_tables=len(stats["standard_tables"]),
        bapis_fms=len(stats["bapis"]) + len(stats["function_modules"]),
        screens=stats["screens_count"] or 0,
        forms=stats["forms_count"] or 0,
        workflows=stats["workflows_count"] or 0,
        bdcs=stats["bdcs_count"] or 0,
        integrations=(1 if stats["thirdparty_intgr"] else 0) + (1 if stats["ui_intgr"] else 0),
        reports=1 if (stats["reports_complexity"] or 0) > 0 else 0,
        code_lines=lines,
        logic_complexity=band,
        adherence=(basic.get("CleanCoreAdherence") or "partial").lower(),
        quality_score=quality,
        has_ui=(stats["screens_count"] or 0) > 0 or bool(stats["ui_intgr"]),
    )


# The same legacy object becomes a different target architecture per approach, so
# the artefact counts themselves differ -- not just a discount on one shared count.
def deriveDrivers(inv: ObjectInventory, approach: str) -> EffortDrivers:
    key = (approach or "side-by-side").lower()
    reads = inv.custom_tables + inv.standard_tables
    ui_screens = inv.screens if inv.has_ui else 0
    common = dict(code_lines=inv.code_lines, logic_complexity=inv.logic_complexity,
                  adherence=inv.adherence, quality_score=inv.quality_score)

    if key == "retire":
        # Nothing is rebuilt: the work is proving the standard app covers the case.
        return EffortDrivers(api_calls=min(inv.bapis_fms, 3),
                             integrations=inv.integrations, **common)

    if key == "on-stack":
        # Standard tables stay put and are exposed through released CDS; only
        # genuinely custom tables survive. One view typically covers several tables.
        return EffortDrivers(
            tables=inv.custom_tables,
            cds_views=_group(reads, per=4),
            api_calls=min(inv.bapis_fms, 6),
            screens=_group(ui_screens, per=2),      # Fiori Elements over bespoke UI
            forms=inv.forms, workflows=inv.workflows, bdcs=inv.bdcs,
            integrations=inv.integrations, reports=inv.reports, **common)

    if key == "hybrid":
        # Standard data is consumed remotely; logic and UI are built on BTP.
        return EffortDrivers(
            tables=inv.custom_tables,
            cds_views=_group(reads, per=6),
            api_calls=max(inv.bapis_fms, _group(reads, per=6)),
            screens=ui_screens, forms=inv.forms, workflows=inv.workflows,
            bdcs=inv.bdcs, integrations=inv.integrations + 1,   # the stack link itself
            reports=inv.reports, **common)

    # side-by-side: the full stack is rebuilt, including replicated persistence.
    return EffortDrivers(
        tables=inv.custom_tables + _group(inv.standard_tables, per=2),
        cds_views=_group(reads, per=3), api_calls=inv.bapis_fms,
        screens=ui_screens, forms=inv.forms, workflows=inv.workflows,
        bdcs=inv.bdcs, integrations=inv.integrations + 1, reports=inv.reports,
        **common)


def _group(count: int, per: int) -> int:
    if count <= 0: return 0
    return max(1, -(-count // per))    # ceil division


def estimateForApproach(inv: ObjectInventory, approach: str) -> EffortBreakdown:
    return estimateEffort(deriveDrivers(inv, approach), approach)


def estimateEffort(drivers: EffortDrivers, approach: str) -> EffortBreakdown:
    key = (approach or "side-by-side").lower()
    scope = APPROACH_SCOPE.get(key)
    if scope is None:
        logger.warning(f"E-SIZING-unknown approach '{approach}'; using side-by-side")
        scope = APPROACH_SCOPE["side-by-side"]

    counts = {
        "table": drivers.tables, "cds_view": drivers.cds_views,
        "api_call": drivers.api_calls, "screen": drivers.screens,
        "form": drivers.forms, "workflow": drivers.workflows,
        "bdc": drivers.bdcs, "integration": drivers.integrations,
        "report": drivers.reports,
    }

    detail, build = {}, 0.0
    for kind, count in counts.items():
        hours = unitHours(kind, count) * scope.get(kind, 1.0)
        if hours:
            detail[kind] = {"count": count, "hours": round(hours, 1),
                            "days": toDays(hours)}
            build += hours

    # Logic scales with the program, not with the inventory it reads. Legacy LOC
    # sizes the OLD program, so only the re-implemented share counts.
    logic = LOGIC_HOURS[_logicBand(drivers)] * LOGIC_REBUILD.get(key, 1.0)

    debt = ADHERENCE_DEBT.get((drivers.adherence or "partial").lower(), 1.1)
    quality = 1 + max(0.0, (100.0 - float(drivers.quality_score or 100))) / 250.0

    # Apply the multipliers to build and logic themselves, so the reported phases
    # always sum to the reported total. Reporting pre-multiplier figures against a
    # post-multiplier total leaves an unexplained gap in any client breakdown.
    scale = debt * quality
    build *= scale
    logic *= scale
    for entry in detail.values():
        entry["hours"] = round(entry["hours"] * scale, 1)
        entry["days"] = toDays(entry["hours"])

    subtotal = build + logic
    cycle = LIFECYCLE_RETIRE if key == "retire" else LIFECYCLE
    design = subtotal * cycle["design"]
    test = subtotal * cycle["test"]
    deploy = subtotal * cycle["deploy"]
    pm = subtotal * cycle["pm"]
    total = subtotal + design + test + deploy + pm

    # A floor would break phase-sum reconciliation, so scale every phase up to it.
    if total < MIN_HOURS and total > 0:
        lift = MIN_HOURS / total
        build *= lift; logic *= lift; design *= lift
        test *= lift; deploy *= lift; pm *= lift
        for entry in detail.values():
            entry["hours"] = round(entry["hours"] * lift, 1)
            entry["days"] = toDays(entry["hours"])
        total = MIN_HOURS

    return EffortBreakdown(
        build_hours=round(build, 1), logic_hours=round(logic, 1),
        design_hours=round(design, 1), test_hours=round(test, 1),
        deploy_hours=round(deploy, 1), pm_hours=round(pm, 1),
        total_hours=round(total, 1),
        build_days=toDays(build), logic_days=toDays(logic),
        design_days=toDays(design), test_days=toDays(test),
        deploy_days=toDays(deploy), pm_days=toDays(pm),
        # Rounded from the unrounded total, so days never disagree with hours.
        total_days=toDays(total), hours_per_day=HOURS_PER_DAY,
        drivers=detail,
        factors={"approach": key, "adherence_debt": debt,
                 "quality_factor": round(quality, 3),
                 "logic_band": _logicBand(drivers)})
