"""Deterministic clean-core decision engine: facts -> rules -> explainable verdict.

No LLM decides approach/adherence/coupling. The LLM supplies raw observations;
this module scans the ABAP itself and maps evidence to decisions via ordered,
editable rules, recording which rule fired and why.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Approach(str, Enum):
    RETIRE = "retire"
    ON_STACK = "on-stack"
    HYBRID = "hybrid"
    SIDE_BY_SIDE = "side-by-side"


class Adherence(str, Enum):
    FULL = "Full"
    PARTIAL = "Partial"
    NONE = "None"


class Coupling(str, Enum):
    TIGHT = "tight"
    LOOSE = "loose"
    RETIRE = "retire"


# SAP Extensibility Classification Level (Clean Core tier). A finer split of the
# same evidence as Adherence: A/B are both "clean" (Adherence Full) but split by
# cloud-native (A) vs approved-classic frameworks (B); C ~ Partial; D ~ None.
class Tier(str, Enum):
    A = "A"   # cloud-native: released C1 APIs / ABAP Cloud / BTP only
    B = "B"   # clean but classic: SAP-approved BAPIs / classic BAdIs / IDocs / ALV
    C = "C"   # conditionally clean: consumes unreleased objects, no core modification
    D = "D"   # not clean core: modifies/bypasses standard, direct unreleased writes


class Severity(str, Enum):
    BREAKING = "breaking"      # modifies/bypasses the core -> upgrade blocker
    RESTRICTED = "restricted"  # unreleased/private API use -> not ABAP Cloud ready
    ADVISORY = "advisory"      # tolerated but not ideal


# One detected clean-core violation with the evidence that produced it.
class Violation(BaseModel):
    code: str
    severity: Severity
    message: str
    evidence: Optional[str] = None


# Ordered evidence gathered from the raw ABAP plus the LLM analysis dict.
class CleanCoreFacts(BaseModel):
    modifies_standard_data: bool = False   # writes standard tables directly
    uses_bdc: bool = False                 # CALL TRANSACTION / batch input
    reads_screen_memory: bool = False      # ASSIGN ('(SAPLxxx)...')
    uses_enhancement: bool = False         # implicit/explicit enhancement, BAdI-less hooks
    calls_unreleased_sap: bool = False     # SAP FM/class with no released contract
    native_sql: bool = False               # EXEC SQL / ADBC -> not ABAP Cloud
    dynamic_core_access: bool = False      # dynamic calls into SAP objects
    exposed_remotely: bool = False         # object itself is an inbound RFC endpoint
    external_integration: bool = False     # reaches another system (SAP or non-SAP)
    third_party_integration: bool = False  # outbound HTTP/REST to a (non-SAP) endpoint
    integration_mechanisms: int = 0        # distinct code integration mechanisms (HTTP/RFC/IDoc/proxy)
    custom_ui: bool = False                # Dynpro/Web Dynpro/BSP owned by the object
    uses_classic_bapi: bool = False        # consumes classic BAPIs (Level-B interface)
    standard_coverage: float = 0.0         # 0..1 of functionality covered by standard
    functionality_count: int = 0           # how many functionalities that ratio spans
    released_api_count: int = 0            # verified released APIs it can consume
    is_analytical: bool = False
    is_report: bool = False
    is_enhancement: bool = False
    is_interface: bool = False
    is_automation: bool = False
    violations: list[Violation] = Field(default_factory=list)

    @property
    def breaks_core(self) -> bool:
        return any(v.severity is Severity.BREAKING for v in self.violations)

    @property
    def restricted(self) -> bool:
        return any(v.severity is Severity.RESTRICTED for v in self.violations)

    # Anything external still calls/depends on this object -> it cannot simply retire.
    # NOTE: this is a RETIRE blocker, NOT a BTP trigger. Plain external reach stays
    # on-stack via released APIs / ABAP Cloud communication scenarios; BTP is chosen
    # only for genuine decoupling (see ApproachRules.decide).
    @property
    def has_external_consumer(self) -> bool:
        return self.external_integration or self.exposed_remotely or self.is_interface


class Verdict(BaseModel):
    approach: Approach
    approach_reason: str
    adherence: Adherence
    adherence_reason: str
    tier: Tier
    tier_reason: str
    target_tier: Tier
    target_tier_reason: str
    coupling: Coupling
    violations: list[Violation] = Field(default_factory=list)
    facts: dict[str, Any] = Field(default_factory=dict)


_PATTERNS: dict[str, re.Pattern] = {
    "std_write": re.compile(r"\b(UPDATE|MODIFY|INSERT|DELETE)\b\s+(?:FROM\s+TABLE\s+)?([A-Za-z0-9_]+)", re.I),
    "std_read": re.compile(r"\bSELECT\b(?:\s+SINGLE)?[\s\S]{0,200}?\bFROM\s+([A-Za-z0-9_]+)", re.I),
    "bdc": re.compile(r"\bCALL\s+TRANSACTION\b|\bBDC_INSERT\b|\bBDC_OPEN_GROUP\b", re.I),
    "screen_mem": re.compile(r"ASSIGN\s+\(\s*['\"]?\(SAPL", re.I),
    "enhancement": re.compile(r"\bENHANCEMENT(-POINT|-SECTION)?\b|\bENHANCEMENT\s+\d|\bIMPLICIT\b", re.I),
    "native_sql": re.compile(r"\bEXEC\s+SQL\b|\bADBC\b|CL_SQL_STATEMENT", re.I),
    "dynamic_call": re.compile(r"CALL\s+FUNCTION\s+\w*\(|CALL\s+METHOD\s+\(|\bPERFORM\s+\(", re.I),
    "rfc_inbound": re.compile(r"REMOTE-ENABLED|RFC-ENABLED", re.I),
    "custom_ui": re.compile(r"\bCALL\s+SCREEN\b|\bMODULE\s+\w+\s+OUTPUT\b|WDY_|\bBSP\b", re.I),
    # Integration mechanisms in the CODE (deterministic), counted to distinguish a
    # single released integration (stays on-stack) from multi-system orchestration
    # (a BTP decoupling driver). HTTP client = outbound to a (usually non-SAP) endpoint.
    "http_client": re.compile(r"CL_HTTP_CLIENT|IF_HTTP_CLIENT|CL_REST_HTTP_CLIENT|CL_WEB_HTTP_CLIENT|CREATE_BY_(?:URL|DESTINATION)", re.I),
    "rfc_dest": re.compile(r"\bDESTINATION\s+['\"]", re.I),
    "idoc_out": re.compile(r"MASTER_IDOC_DISTRIBUTE|EDI_DOCUMENT_OPEN_FOR_CREATE|IDOC_OUTPUT", re.I),
    "proxy": re.compile(r"CO_PROXY|CL_PROXY_|CALL\s+METHOD\s+\w*PROXY", re.I),
}

# SAP function modules that are not released for ABAP Cloud (C1) consumption.
_UNRELEASED_HINTS = re.compile(
    r"CALL\s+FUNCTION\s+'(?!Z|Y)(\w*(_GET_DETAIL|_MAINTAIN|_POST|_CHANGE|_CREATE)\w*)'", re.I)

_TRUTHY = {"true", "1", "yes", "y"}


def _isCustomObject(name: str) -> bool:
    return bool(name) and name[:1].upper() in ("Z", "Y")


def _asFlag(value: Any) -> bool:
    return str(value).strip().lower() in _TRUTHY


def _asList(value: Any) -> list:
    if isinstance(value, list): return value
    return [] if value in (None, "") else [value]


# Scans raw ABAP for structural clean-core violations; the LLM never sees this step.
class CodeScanner:
    def __init__(self, code: str, standard_tables: set[str]):
        self.code = code or ""
        self.standard_tables = standard_tables

    def _writesStandardTable(self) -> tuple[bool, Optional[str]]:
        for _verb, table in _PATTERNS["std_write"].findall(self.code):
            name = table.upper()
            if name in self.standard_tables and not _isCustomObject(name):
                return True, name
        return False, None

    # Direct SELECT on a standard table is not ABAP Cloud compatible: only released
    # C1 CDS views (I_*/API_*) may be read. Previously only writes were flagged, so
    # a report reading KNA1/KNVV directly scored "Full" adherence.
    def _readsStandardTable(self) -> list[str]:
        hits = []
        for table in _PATTERNS["std_read"].findall(self.code):
            name = table.upper()
            if name in self.standard_tables and not _isCustomObject(name) \
                    and not name.startswith(("I_", "API_", "C_", "P_", "R_", "E_")):
                if name not in hits:
                    hits.append(name)
        return hits

    def scan(self) -> list[Violation]:
        found: list[Violation] = []
        writes, table = self._writesStandardTable()
        if writes:
            found.append(Violation(code="STD_TABLE_WRITE", severity=Severity.BREAKING,
                                   message="Direct write on standard SAP table", evidence=table))
        reads = self._readsStandardTable()
        if reads:
            found.append(Violation(code="STD_TABLE_READ", severity=Severity.RESTRICTED,
                                   message="Direct read of standard SAP table instead of a "
                                           "released CDS view",
                                   evidence=", ".join(reads[:6])))
        if _PATTERNS["bdc"].search(self.code):
            found.append(Violation(code="BDC", severity=Severity.BREAKING,
                                   message="Batch input / CALL TRANSACTION against standard transaction"))
        if _PATTERNS["screen_mem"].search(self.code):
            found.append(Violation(code="SCREEN_MEMORY", severity=Severity.BREAKING,
                                   message="Reads SAP GUI screen memory"))
        if _PATTERNS["enhancement"].search(self.code):
            found.append(Violation(code="ENHANCEMENT", severity=Severity.RESTRICTED,
                                   message="Implicit/explicit enhancement instead of released BAdI"))
        if _PATTERNS["native_sql"].search(self.code):
            found.append(Violation(code="NATIVE_SQL", severity=Severity.RESTRICTED,
                                   message="Native SQL/ADBC is not permitted in ABAP Cloud"))
        if _UNRELEASED_HINTS.search(self.code):
            found.append(Violation(code="UNRELEASED_API", severity=Severity.RESTRICTED,
                                   message="Calls SAP function module with no released C1 contract"))
        if _PATTERNS["dynamic_call"].search(self.code):
            found.append(Violation(code="DYNAMIC_CALL", severity=Severity.ADVISORY,
                                   message="Dynamic call prevents static released-API verification"))
        return found


# Builds CleanCoreFacts by combining the code scan with LLM-reported observations.
class FactExtractor:
    def __init__(self, code_object: str, analysis: dict):
        analysis = analysis or {}
        self.code = code_object or ""
        self.basic = analysis.get("basic_analysis") or {}
        self.technical = analysis.get("technical_analysis") or {}
        self.s4 = analysis.get("highlvl_s4_analysis") or {}
        self.integration = self.technical.get("IntegrationAnalysis") or {}
        self.sql = self.technical.get("SQLAnalysis") or {}

    def _standardTables(self) -> set[str]:
        names = set()
        for entry in _asList(self.basic.get("StandardTables")):
            match = re.match(r"\s*([A-Za-z0-9_]+)", str(entry))
            if match: names.add(match.group(1).upper())
        return names

    # Released APIs the object can actually consume, counted only when grounding verified them.
    # Counts only APIs the grounding step could VERIFY against the live catalog.
    # UNVERIFIED means "exists in SAP but not testable here", which is not evidence
    # of reusable surface; falling back to the raw LLM list let a hallucinated API
    # name decide hybrid vs side-by-side.
    def _releasedApiCount(self) -> int:
        verified = _asList(self.s4.get("SAPStandardAPIs_verified"))
        if verified:
            return sum(1 for item in verified
                       if str(item.get("status", "")).upper() == "VERIFIED")
        # No grounding ran (MCP down/disabled): trust nothing, so BTP work defaults
        # to side-by-side rather than assuming reusable APIs exist.
        return 0

    # Share of functionality the retire-check found covered by standard apps.
    def _standardCoverage(self) -> float:
        functionalities = _asList(self.s4.get("FunctionalitiesMap"))
        if not functionalities: return 0.0
        weights = {"full": 1.0, "partial": 0.5}
        total = sum(weights.get(str(f.get("ReplacementCoverage", "")).strip().lower(), 0.0)
                    for f in functionalities)
        return round(total / len(functionalities), 3)

    def extract(self) -> CleanCoreFacts:
        violations = CodeScanner(self.code, self._standardTables()).scan()
        codes = {v.code for v in violations}
        wricef = [str(w).lower() for w in _asList(self.basic.get("WRICEFObjectType"))]
        usecase = [str(u).lower() for u in _asList(self.basic.get("UseCaseArea"))]

        # Integration mechanisms in the code (deterministic). HTTP client => outbound
        # to a (usually non-SAP) endpoint; count distinct mechanisms for multi-system.
        code = self.code
        _http = bool(_PATTERNS["http_client"].search(code))
        _rfc = bool(_PATTERNS["rfc_dest"].search(code))
        _idoc = bool(_PATTERNS["idoc_out"].search(code))
        _proxy = bool(_PATTERNS["proxy"].search(code))
        _mechs = sum([_http, _rfc, _idoc, _proxy])
        _llm_tp = _asFlag(self.integration.get("ThirdPartyIntegration"))

        return CleanCoreFacts(
            modifies_standard_data="STD_TABLE_WRITE" in codes,
            uses_bdc="BDC" in codes or _asFlag(self.basic.get("BDCUsed")),
            reads_screen_memory="SCREEN_MEMORY" in codes,
            uses_enhancement="ENHANCEMENT" in codes,
            calls_unreleased_sap="UNRELEASED_API" in codes,
            native_sql="NATIVE_SQL" in codes,
            dynamic_core_access="DYNAMIC_CALL" in codes,
            exposed_remotely=bool(_PATTERNS["rfc_inbound"].search(self.code)),
            external_integration=_llm_tp or _mechs > 0,
            third_party_integration=_http or _llm_tp,
            integration_mechanisms=_mechs,
            custom_ui=_asFlag(self.integration.get("UIIntegration")) or bool(_PATTERNS["custom_ui"].search(self.code)),
            uses_classic_bapi=bool(_asList(self.basic.get("BAPIs"))),
            standard_coverage=self._standardCoverage(),
            functionality_count=len(_asList(self.s4.get("FunctionalitiesMap"))),
            released_api_count=self._releasedApiCount(),
            is_analytical=_asFlag(self.basic.get("IsAnalyticsReport")),
            is_report="report" in wricef,
            is_enhancement="enhancement" in wricef,
            is_interface="interface" in wricef,
            is_automation="automation" in usecase,
            violations=violations,
        )


# Maps facts to an approach. Ordered rules, first match wins.
class ApproachRules:
    RETIRE_COVERAGE = 0.85   # standard replaces nearly all functionality
    RETIRE_MIN_FUNCS = 3     # ...measured over enough functionality to be credible
    HYBRID_MIN_APIS = 2      # hybrid needs real reusable surface, not one API

    # Clean-core precedence (location is secondary to using released contracts):
    #   1. retire   - standard covers it and nothing external depends on it
    #   2. BTP       - genuine decoupling (multi-system orchestration, third-party/
    #                  non-SAP integration, any core-breaking constructs, or custom UX
    #                  incl. reports with a custom UI for SAP Build/BTP)
    #   3. on-stack  - the DEFAULT target (ABAP Cloud + released APIs), regardless of
    #                  size and even with plain external reach (single RFC/IDoc/interface)
    def decide(self, facts: CleanCoreFacts) -> tuple[Approach, str]:
        # Retire needs standard coverage AND no external consumer (something still
        # calling it must be served). Enough functionalities to trust the ratio.
        if (facts.standard_coverage >= self.RETIRE_COVERAGE
                and not facts.has_external_consumer
                and facts.functionality_count >= self.RETIRE_MIN_FUNCS):
            return Approach.RETIRE, (f"Standard covers {facts.standard_coverage:.0%} of "
                                     f"{facts.functionality_count} functionalities and nothing "
                                     f"external depends on it -> retire and adopt standard apps")

        # BTP is warranted only by genuine decoupling drivers. Plain external reach is
        # NOT one of them -- released APIs / ABAP Cloud communication scenarios serve
        # RFC/IDoc/HTTP/interface contracts on the stack.
        reasons = []
        if facts.integration_mechanisms >= 2:
            reasons.append("multi-system orchestration across several integration mechanisms")
        if facts.third_party_integration:
            reasons.append("third-party / non-SAP integration to decouple from the core")
        if facts.breaks_core:
            reasons.append("core-breaking constructs needing decoupled remediation")
        heavy_ux = facts.custom_ui and not facts.is_analytical
        if heavy_ux:
            reasons.append("heavy custom UX suited to SAP Build / Fiori on BTP")
        if reasons:
            why = "; ".join(reasons)
            if facts.released_api_count >= self.HYBRID_MIN_APIS:
                return Approach.HYBRID, (f"BTP warranted ({why}); with {facts.released_api_count} "
                    f"released S/4 API(s) to consume from the stack, keep custom logic/UI on BTP (hybrid).")
            return Approach.SIDE_BY_SIDE, (f"BTP warranted ({why}); no reusable released S/4 API surface "
                f"-> build fully on SAP BTP (side-by-side).")

        # On-stack is the default clean-core target -- ABAP Cloud + released contracts.
        # (breaks_core no longer lands here: it always fires a BTP decoupling trigger above.)
        if facts.is_analytical:
            return Approach.ON_STACK, "Analytical object -> embedded analytics (CDS + Fiori) / SAC on the stack"
        if facts.is_report:
            return Approach.ON_STACK, "Reporting object -> CDS view with Fiori list report on the stack"
        if facts.is_enhancement or facts.is_automation:
            return Approach.ON_STACK, "Extension of standard behaviour -> released BAdI / RAP on the stack"
        if facts.has_external_consumer:
            return Approach.ON_STACK, ("External reach served via released APIs / ABAP Cloud communication "
                                       "scenarios -> stays on the stack (no decoupling driver for BTP)")
        return Approach.ON_STACK, "Self-contained custom application -> rebuild on the stack with ABAP Cloud"


# Maps violation severity to a clean-core adherence level.
class AdherenceRules:
    def decide(self, facts: CleanCoreFacts) -> tuple[Adherence, str]:
        breaking = [v for v in facts.violations if v.severity is Severity.BREAKING]
        if breaking:
            return Adherence.NONE, "; ".join(v.message for v in breaking)
        restricted = [v for v in facts.violations if v.severity is Severity.RESTRICTED]
        if restricted:
            return Adherence.PARTIAL, "; ".join(v.message for v in restricted)
        if facts.dynamic_core_access:
            return Adherence.PARTIAL, "Dynamic access to core objects prevents released-API verification"
        return Adherence.FULL, "No core modification or unreleased API usage detected"


# Maps the same evidence to SAP's Extensibility Classification Level (A-D). Ordered,
# first match wins; consistent with adherence (D<->None, C<->Partial, A/B<->Full).
class TierRules:
    # One-line SAP definition per level, prefixed to every justification so the
    # reader always sees what the level MEANS before the object-specific evidence.
    _DEF = {
        Tier.A: "Level A (Cloud-native, cleanest): extensions use only released C1 APIs, "
                "released CDS views and the ABAP Cloud extensibility model. 100% upgrade-safe.",
        Tier.B: "Level B (Compliant classic): clean, but relies on SAP-approved CLASSIC "
                "frameworks (classic BAPIs, classic BAdIs, IDocs, ALV/Dynpro) where no "
                "released cloud API exists. Supported and stable, but a modernization candidate.",
        Tier.C: "Level C (Conditionally clean): consumes UNRELEASED / private SAP objects "
                "without modifying standard code. Upgrade-sensitive - must be isolated and "
                "tracked against SAP release/ATC changes.",
        Tier.D: "Level D (Not clean core / technical debt): MODIFIES or BYPASSES standard "
                "SAP. Blocks automated upgrades and breaks clean-core compatibility - must "
                "be remediated.",
    }

    # Render violations as "message (evidence)" so the reason names the actual table/
    # construct that triggered it, not just the rule.
    @staticmethod
    def _fmt(violations):
        out = []
        for v in violations:
            out.append(f"{v.message} ({v.evidence})" if getattr(v, "evidence", None) else v.message)
        return out

    def decide(self, facts: CleanCoreFacts) -> tuple[Tier, str]:
        breaking = [v for v in facts.violations if v.severity is Severity.BREAKING]
        if breaking:
            found = "; ".join(self._fmt(breaking))
            return Tier.D, (f"{self._DEF[Tier.D]} Detected in this object: {found}. Each of these "
                            f"directly touches or drives standard SAP and must be rewritten with "
                            f"clean-core extensibility before this object is upgrade-safe.")
        restricted = [v for v in facts.violations if v.severity is Severity.RESTRICTED]
        if restricted or facts.dynamic_core_access:
            found = "; ".join(self._fmt(restricted)) or "dynamic call into core objects (static release verification not possible)"
            return Tier.C, (f"{self._DEF[Tier.C]} Detected in this object: {found}. No standard SAP "
                            f"object is modified, so the fix is to replace these with released CDS "
                            f"views / released APIs and isolate what remains behind a wrapper.")
        # Clean (Adherence Full). Split A vs B by cloud-native vs approved-classic.
        classic = []
        if facts.custom_ui: classic.append("classic Dynpro / SAP GUI UI")
        if facts.uses_classic_bapi: classic.append("classic BAPIs")
        # (uses_bdc is a BREAKING violation and is already handled as Tier D above.)
        if classic:
            extra = (f" It also consumes {facts.released_api_count} released standard API(s), "
                     f"which can carry it to Level A where a cloud equivalent exists."
                     if facts.released_api_count else "")
            return Tier.B, (f"{self._DEF[Tier.B]} This object is clean (no core modification and no "
                            f"unreleased access) but still uses: {', '.join(classic)}. It reaches "
                            f"Level A once these are replaced by released OData/RAP equivalents.{extra}")
        api_note = (f"It consumes {facts.released_api_count} verified released standard API(s)."
                    if facts.released_api_count else
                    "It relies only on released CDS / ABAP Cloud constructs.")
        return Tier.A, (f"{self._DEF[Tier.A]} No core modification, no unreleased/private access and "
                        f"no classic-only constructs were detected. {api_note} Nothing further is "
                        f"required for clean-core compliance.")

    # The clean-core ceiling once the recommended approach is applied. Level A is the
    # goal, but it is only credible when a released replacement EXISTS for whatever
    # made the object dirty. When the object breaks core / stays classic and no
    # released API is confirmed, the honest ceiling is Level B (approved classic).
    def target(self, facts: CleanCoreFacts, approach: "Approach") -> tuple[Tier, str]:
        if approach is Approach.RETIRE:
            return Tier.A, (f"{self._DEF[Tier.A]} Target after RETIRE: the custom object is "
                            f"decommissioned and its functionality is delivered by released standard "
                            f"S/4HANA apps / APIs - inherently cloud-native, so Level A.")

        path = {
            Approach.ON_STACK: "rebuilt with ABAP Cloud / RAP, released BAdIs and released CDS views on the stack",
            Approach.HYBRID: "consuming released S/4 (CDS / OData) from the stack while custom logic and UI move to SAP BTP",
            Approach.SIDE_BY_SIDE: "rebuilt fully on SAP BTP (CAP / RAP) against released APIs",
        }.get(approach, "remediated to released C1 APIs / ABAP Cloud")

        # Can the dirtiness actually be lifted to cloud-native? It needs a released
        # replacement. If the object breaks core or is classic-bound AND we could not
        # confirm ANY released API in its domain, Level A is not yet provable -> B.
        dirty = facts.breaks_core or facts.uses_classic_bapi or facts.custom_ui or facts.exposed_remotely
        if dirty and facts.released_api_count == 0:
            blockers = "; ".join(self._fmt(
                [v for v in facts.violations if v.severity is Severity.BREAKING])) or \
                "classic interfaces / remote exposure"
            return Tier.B, (f"{self._DEF[Tier.B]} Target after remediation ({approach.value}): the "
                            f"object would be {path}. However NO released cloud API was confirmed for "
                            f"its core-breaking / classic operations ({blockers}), so the provable "
                            f"ceiling is Level B (released BAPI / IDoc via Integration Suite). It "
                            f"reaches Level A only once a released API for these operations is confirmed.")

        return Tier.A, (f"{self._DEF[Tier.A]} Target after remediation ({approach.value}): the object "
                        f"is {path}. With {facts.released_api_count} released standard API(s) available "
                        f"to consume, the core-breaking / unreleased constructs are replaced by released "
                        f"equivalents, making it fully cloud-native (Level A).")


_COUPLING_BY_APPROACH = {
    Approach.RETIRE: Coupling.RETIRE,
    Approach.ON_STACK: Coupling.TIGHT,
    Approach.HYBRID: Coupling.LOOSE,
    Approach.SIDE_BY_SIDE: Coupling.LOOSE,
}


# Single entry point: raw ABAP + analysis dict -> explainable Verdict.
class CleanCoreEngine:
    def __init__(self, approach_rules: ApproachRules | None = None,
                 adherence_rules: AdherenceRules | None = None,
                 tier_rules: TierRules | None = None):
        self.approach_rules = approach_rules or ApproachRules()
        self.adherence_rules = adherence_rules or AdherenceRules()
        self.tier_rules = tier_rules or TierRules()

    def evaluate(self, code_object: str, analysis: dict) -> Verdict:
        facts = FactExtractor(code_object, analysis).extract()
        approach, approach_reason = self.approach_rules.decide(facts)
        adherence, adherence_reason = self.adherence_rules.decide(facts)
        tier, tier_reason = self.tier_rules.decide(facts)
        target_tier, target_tier_reason = self.tier_rules.target(facts, approach)
        return Verdict(
            approach=approach,
            approach_reason=approach_reason,
            adherence=adherence,
            adherence_reason=adherence_reason,
            tier=tier,
            tier_reason=tier_reason,
            target_tier=target_tier,
            target_tier_reason=target_tier_reason,
            coupling=_COUPLING_BY_APPROACH[approach],
            violations=facts.violations,
            facts=facts.model_dump(exclude={"violations"}),
        )


_ENGINE = CleanCoreEngine()


# Backward-compatible wrappers so existing helpers.py call sites keep working.
def extractFacts(code_object: str, complete_analysis: dict) -> dict:
    return FactExtractor(code_object, complete_analysis).extract().model_dump()


def evaluateCleanCore(code_object: str, complete_analysis: dict) -> Verdict:
    return _ENGINE.evaluate(code_object, complete_analysis)


def decideApproach(facts: dict) -> tuple[str, str]:
    approach, reason = ApproachRules().decide(CleanCoreFacts(**facts))
    return approach.value, reason


def decideAdherence(facts: dict) -> tuple[str, str]:
    adherence, reason = AdherenceRules().decide(CleanCoreFacts(**facts))
    return (adherence.value, reason) if adherence is not Adherence.FULL else ("", "")
