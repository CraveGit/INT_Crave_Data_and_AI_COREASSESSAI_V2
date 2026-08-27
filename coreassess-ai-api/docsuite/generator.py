import os
import io
import re
import json
import logging
import html as _html
from contextvars import copy_context
from concurrent.futures import ThreadPoolExecutor, as_completed

import markdownify

from .render import make_bold, markdown_into_doc, markdown_to_styled_html
from .template import buildShell
from .sections import sectionInstruction, planSections
from .diagram import buildFlowSvg, buildErDiagram, buildUiFlow, svgToPng
from .embed import embedFonts
from . import doc_prompts as P
from genai import complete
from errors import ApiError

logger = logging.getLogger(__name__)

SYS = ("You are expert in SAP modernization, Clean Core and {name} documentation. "
       "Write in clear professional prose. Output GitHub-flavoured Markdown only.")

DOC_TITLES = {
    "FSD": ("Functional Specification", "Functional_Specification_Document"),
    "TSD": ("Technical Specification", "Technical_Specification_Document"),
    "BBD": ("Business Blueprint", "Business_Blueprint_Document"),
}

# Keys MUST match the doc_type sent by the UI/CAP (FSD/TSD/BBP). "BBD" was a typo,
# so BBP silently fell back to the FSD prompt.
PROMPTS = {"FSD": P.FSD_Prompt, "TSD": P.TSD_Prompt, "BBP": P.BRD_Prompt}

FORMAT_RULES = (
    "Formatting rules:\n"
    "- Markdown only. Never wrap the answer in a code fence.\n"
    "- Level-1 headings (#) for the numbered sections given; ## and ### beneath.\n"
    "- Use markdown tables with a header row for any structured data.\n"
    "- Use - for bullets and 1. for ordered steps.\n"
    "- Never emit HTML tags.\n"
    "- OMIT anything the analysis does not contain. Never write 'NA', 'N/A', 'null', "
    "'none', 'TBD', '-' or leave an empty cell/field/placeholder; drop the empty row, "
    "column or section instead. Do not add a column whose cells would all be empty.\n"
    "- Do NOT invent QA/'Verification Status'/'Verified'/'Unverified'/'evidence' "
    "columns or narratives. Present the recommendations directly; internal grounding "
    "metadata is not part of this deliverable.\n"
    "- NEVER draw ASCII / text-art diagrams, box-and-arrow sketches or flow charts in "
    "text. Diagrams are rendered as real images ONLY in the downloaded Word document. "
    "Where a figure belongs, write a single italic caption line instead, e.g. "
    "'*Figure: end-to-end process flow (rendered in the downloaded Word document).*' "
    "and continue with prose -- do not attempt to depict it in characters.\n"
    "- NEVER include pricing, cost, licence/subscription fees, unit prices or currency "
    "figures for BTP services or anything else. Pricing is INTERNAL only and must not "
    "appear in this document. List recommended services with their purpose and quantity/"
    "metric, never a price.\n"
    "- This is a CLIENT deliverable, not a tool dump. NEVER expose the internal analysis "
    "schema: no JSON key / field names (e.g. IsAnalyticsReport, RecommendedApproach, "
    "CleanCoreTier, DecisionFacts, ManEfforts), no 'true/false' flag values, and no "
    "meta-commentary about the tool's own reasoning (e.g. 'the analysis evaluated four "
    "strategies', 'because the object is analytical (IsAnalyticsReport: true)'). State the "
    "conclusion in business/technical prose using the underlying FACTS, not the field that "
    "carried them -- e.g. write 'This is an analytical report tightly coupled to SD-SHP/WM "
    "data, so an on-stack embedded-analytics rebuild is recommended.'\n"
)

# Without an explicit depth contract the model writes a summary, not a
# specification: sections collapsed to ~100 words and some to tables only.
DEPTH_RULES = (
    "Depth requirements (this is a client deliverable): CONCISE YET PRECISE. Maximise "
    "information per sentence; do NOT pad to hit a word count. A shorter section that is "
    "dense with specifics beats a long one that restates the obvious.\n"
    "- Do NOT write to a word target. Write only as much as the facts require; a tight\n"
    "  section of 150 concrete words is better than 800 words of narration.\n"
    "- Every sentence must carry a SPECIFIC fact from the analysis: a named table, field,\n"
    "  API, transaction, module, BAPI, count, effort figure, complexity score or tier. If\n"
    "  a sentence would read the same for any other SAP object, delete it.\n"
    "- Prefer tables and tight bullet lists for structured facts (tables->CDS, APIs,\n"
    "  validations, interfaces, effort). Add one or two lines of prose to interpret each,\n"
    "  not a paragraph. Never a wall of narration around a single fact.\n"
    "- For each recommendation state, in one or two sentences: what to do, the concrete\n"
    "  reason from this object's code/analysis, and the impact of not doing it. No option\n"
    "  essays.\n"
    "- Quantify wherever the analysis allows (table/screen/BAPI/interface counts, effort\n"
    "  hours/PD, quality score, clean-core tier). Numbers over adjectives.\n"
    "- Where the analysis lacks data for a required point, say precisely what is missing\n"
    "  and who must confirm it, in one line -- do not invent and do not pad around it.\n"
    "\n"
    "Banned filler: no generic assurances ('aligning with SAP best practices', "
    "'future-proof', 'robust and scalable', 'ensuring long-term viability'), no restating "
    "the section title as a sentence, no 'in today's landscape' preambles. Every line "
    "earns its place with a fact; close on a concrete fact, figure or action.\n"
)


def _meta(analysis):
    basic = (analysis or {}).get("basic_analysis", {}) or {}
    return {
        "object": str(basic.get("ObjectID") or "object"),
        "approach": str(basic.get("RecommendedApproach") or ""),
        "adherence": str(basic.get("CleanCoreAdherence") or ""),
        "tshirt": str(basic.get("TShirtSize") or ""),
    }


def _shell(doc_type, object_name, company, project, analysis):
    title, filename = DOC_TITLES.get(doc_type, DOC_TITLES["FSD"])
    meta = _meta(analysis)
    doc = buildShell(title, object_name or meta["object"], company, project, meta["approach"])
    return doc, title, filename


def _dig(analysis, path):
    node = analysis or {}
    for part in path.split('.'):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def _facts(analysis, extra_paths):
    basic = (analysis or {}).get("basic_analysis", {}) or {}
    payload = {"object": basic.get("ObjectID"),
               "functional": str(basic.get("FunctionalAnalysis") or "")[:1200]}
    for key, path in extra_paths.items():
        payload[key] = _dig(analysis, path)
    return json.dumps(payload, default=str)[:2800]


def _asBool(value):
    return str(value).strip().lower() in ("true", "1", "yes")


# A UI figure only earns its place where a UI is actually built or adopted:
# retire reaches standard Fiori apps, on-stack needs a real screen, and the
# BTP-side approaches always build new.
def _uiApplies(analysis):
    approach = (_meta(analysis)["approach"] or "").lower()
    if approach in ("hybrid", "side-by-side"):
        return True
    if approach == "retire":
        return bool(_dig(analysis, "highlvl_s4_analysis.SAPStandardFioriApps"))
    if approach == "on-stack":
        try:
            screens = int(_dig(analysis, "basic_analysis.ScreensUsed") or 0)
        except (TypeError, ValueError):
            screens = 0
        return screens > 0 or _asBool(_dig(analysis, "technical_analysis.IntegrationAnalysis.UIIntegration"))
    return False


# Figure catalogue: heading -> what to draw, which data must exist, and the facts
# handed to the extractor. A figure is skipped when its data is absent, so a
# document never carries an empty or invented diagram.
FIGURES = {
    "FSD": [
        {"heading": "process flow", "kind": "flow", "requires": "basic_analysis.FunctionalAnalysis",
         "facts": {"crud": "basic_analysis.CRUD",
                   "tables": "basic_analysis.StandardTables",
                   "approach": "basic_analysis.RecommendedApproach"}},
        {"heading": "interfaces and events", "kind": "flow", "requires": "interface_analysis.IDocs",
         "facts": {"idocs": "interface_analysis.IDocs",
                   "apis": "interface_analysis.StandardAPIs",
                   "events": "interface_analysis.BOREvents"}},
        {"heading": "recommended approach", "kind": "ui", "gate": _uiApplies,
         "facts": {"approach": "basic_analysis.RecommendedApproach",
                   "screens": "basic_analysis.ScreensUsed",
                   "fiori": "highlvl_s4_analysis.SAPStandardFioriApps",
                   "ui_integration": "technical_analysis.IntegrationAnalysis.UIIntegration",
                   "dev_approach": "technical_analysis.DevelopmentApproach"}},
    ],
    "TSD": [
        {"heading": "process flow", "kind": "flow", "requires": "basic_analysis.FunctionalAnalysis",
         "facts": {"crud": "basic_analysis.CRUD",
                   "bapis": "basic_analysis.BAPIs",
                   "approach": "basic_analysis.RecommendedApproach"}},
        {"heading": "data model", "kind": "er", "requires": "basic_analysis.StandardTables",
         "facts": {"standard_tables": "basic_analysis.StandardTables",
                   "custom_tables": "basic_analysis.CustomTables",
                   "cds": "technical_analysis.SQLAnalysis.TablesCDSViews",
                   "sql": "technical_analysis.SQLAnalysis.SQLRecommendation"}},
        {"heading": "interfaces and events", "kind": "flow", "requires": "interface_analysis.StandardAPIs",
         "facts": {"apis": "interface_analysis.StandardAPIs",
                   "idocs": "interface_analysis.IDocs",
                   "modernization": "interface_analysis.IntegrationModernization"}},
        {"heading": "target design", "kind": "ui", "gate": _uiApplies,
         "facts": {"approach": "basic_analysis.RecommendedApproach",
                   "screens": "basic_analysis.ScreensUsed",
                   "fiori": "highlvl_s4_analysis.SAPStandardFioriApps",
                   "ui_integration": "technical_analysis.IntegrationAnalysis.UIIntegration",
                   "dev_approach": "technical_analysis.DevelopmentApproach"}},
    ],
    "BBD": [
        {"heading": "solution architecture", "kind": "flow", "requires": "basic_analysis.FunctionalAnalysis",
         "facts": {"approach": "basic_analysis.RecommendedApproach",
                   "btp": "technical_analysis.BTPServices",
                   "fiori": "highlvl_s4_analysis.SAPStandardFioriApps"}},
        {"heading": "target state", "kind": "flow", "requires": "highlvl_s4_analysis.S4Analysis",
         "facts": {"s4": "highlvl_s4_analysis.S4Analysis",
                   "apis": "highlvl_s4_analysis.SAPStandardAPIs",
                   "fiori": "highlvl_s4_analysis.SAPStandardFioriApps"}},
        {"heading": "clean core alignment", "kind": "ui", "gate": _uiApplies,
         "facts": {"approach": "basic_analysis.RecommendedApproach",
                   "screens": "basic_analysis.ScreensUsed",
                   "fiori": "highlvl_s4_analysis.SAPStandardFioriApps",
                   "ui_integration": "technical_analysis.IntegrationAnalysis.UIIntegration",
                   "dev_approach": "technical_analysis.DevelopmentApproach"}},
    ],
}

SUBJECTS = {
    "process flow": "end-to-end process flow",
    "interfaces and events": "integration flow between SAP and external systems",
    "data model": "entity relationship model of the tables used",
    "solution architecture": "target solution architecture across S/4HANA and BTP",
    "target state": "target state landscape after modernization",
    "recommended approach": "user interface navigation flow",
    "target design": "user interface navigation flow",
    "clean core alignment": "user interface navigation flow",
}


def _one_figure(spec, analysis, sections_lower, model):
    if spec["heading"] not in sections_lower:
        return None, None
    if spec.get("gate") and not spec["gate"](analysis):
        return None, None
    if spec.get("requires") and not _dig(analysis, spec["requires"]):
        return None, None
    subject = (f"{SUBJECTS.get(spec['heading'], spec['heading'])} "
               f"for SAP object {_meta(analysis)['object']}")
    facts = _facts(analysis, spec["facts"])
    kind = spec["kind"]
    if kind == "er":
        svg = buildErDiagram(complete, subject, facts, model=model)
    elif kind == "ui":
        svg = buildUiFlow(complete, subject, facts,
                          approach=_meta(analysis)["approach"], model=model)
    else:
        svg = buildFlowSvg(complete, subject, facts, model=model)
    png = svgToPng(svg) if svg else None
    return (spec["heading"], png) if png else (None, None)


# Diagrams are best-effort: a failed render must never fail the document.
def _diagrams(doc_type, analysis, model):
    specs = FIGURES.get(doc_type, [])
    sections_lower = [s.lower() for s in planSections(doc_type, analysis)]
    figures = {}
    with ThreadPoolExecutor(max_workers=min(3, max(1, len(specs)))) as pool:
        futures = [pool.submit(copy_context().run, _one_figure, spec, analysis,
                               sections_lower, model) for spec in specs]
        for future in as_completed(futures):
            try:
                heading, png = future.result()
                if heading:
                    figures[heading] = png
            except Exception as e:
                logger.error(f"E-DOCGEN-figure: {e}")
    return figures


SECTION_WORKERS = int(os.getenv("DOC_SECTION_WORKERS", "4"))
# Headroom for a 700-1000 word section plus tables; sections are written
# independently so this is per chapter, not per document.
SECTION_MAX_TOKENS = int(os.getenv("DOC_SECTION_MAX_TOKENS", "8000"))


# Sections whose value is structured logic, not prose.
SECTION_HINTS = {
    "processing logic": (
        "Write the target processing logic as PSEUDO-CODE, not ABAP. Use a fenced "
        "block (```) containing numbered steps with INPUT / VALIDATE / READ / "
        "TRANSFORM / WRITE / RAISE keywords, naming the real tables, fields and "
        "APIs from the analysis. Cover the main path, each validation and each "
        "error path. Follow the block with prose explaining the decisions, the "
        "error handling and where the logic differs from the legacy program."),
}


def _section_body(doc_type, analysis, index, title, outline, extra=""):
    doc_title, _ = DOC_TITLES.get(doc_type, DOC_TITLES["FSD"])
    # Section-specific instruction, appended last so it outranks the generic rules.
    hint = SECTION_HINTS.get(title.strip().lower(), "")
    content = complete(
        SYS.format(name=doc_title),
        f"{PROMPTS.get(doc_type, P.FSD_Prompt)}\n{FORMAT_RULES}\n{DEPTH_RULES}\n"
        f"You are writing ONE section of a {doc_title} for SAP object "
        f"{_meta(analysis)['object']}.\n"
        f"Full document outline (for context only, do not write the others):\n{outline}\n\n"
        f"Write section {index}: \"{title}\".\n"
        f"Start with the line '# {index}. {title}' and write only this section.\n"
        f"Analysis JSON:\n{json.dumps(analysis)}\n{extra}"
        + (f"\n\nSECTION-SPECIFIC REQUIREMENT (overrides the general rules):\n{hint}"
           if hint else ""),
        max_tokens=SECTION_MAX_TOKENS)
    return content or ""


# One call per section: a single request converges on ~1200 words no matter the
# token budget, which is a summary rather than a specification.
def _body(doc_type, analysis, extra=""):
    titles = planSections(doc_type, analysis)
    outline = "\n".join(f"{i}. {t}" for i, t in enumerate(titles, 1))
    results = [""] * len(titles)

    with ThreadPoolExecutor(max_workers=SECTION_WORKERS) as pool:
        futures = {
            pool.submit(copy_context().run, _section_body, doc_type, analysis,
                        i, title, outline, extra): i - 1
            for i, title in enumerate(titles, 1)
        }
        for future in as_completed(futures):
            slot = futures[future]
            try:
                results[slot] = future.result()
            except Exception as e:
                logger.error(f"E-DOCGEN-section {titles[slot]}: {e}")

    body = "\n\n".join(part.strip() for part in results if part.strip())
    if not body:
        raise ApiError("model_empty", "empty model response", 502)
    return body


def _to_bytes(doc):
    buf = io.BytesIO()
    doc.save(buf)
    # Embed the packaged faces so the file keeps its typography off-machine.
    return io.BytesIO(embedFonts(buf.getvalue()))


# On-stack and retire keep everything on the ABAP stack, so SAP BTP side-by-side
# services are out of scope. Strip BTP data from the analysis used for generation
# (the stored analysis is untouched) so the "BTP Services" section, BTP diagram
# facts, and the section-prompt JSON all carry no BTP recommendation. Free-text
# BTP mentions are already suppressed by the APPROACH DIRECTIVE in the prompts;
# this is the deterministic backstop.
_NON_BTP_APPROACHES = {"on-stack", "on stack", "onstack", "retire"}


# Grounding adds internal provenance keys (e.g. SAPStandardAPIs_verified,
# S4Tables_verified) with VERIFIED/UNVERIFIED/MISSING statuses. These are for the
# analysis pipeline, NOT the client document -- when they leaked into the doc the
# model wrote whole "marked Unverified" QA narratives. Strip any *_verified key.
def _strip_verified(obj):
    if isinstance(obj, dict):
        return {k: _strip_verified(v) for k, v in obj.items() if not str(k).endswith("_verified")}
    if isinstance(obj, list):
        return [_strip_verified(v) for v in obj]
    return obj


def _sanitize_btp(analysis):
    import copy
    a = _strip_verified(copy.deepcopy(analysis or {}))
    approach = str((a.get("basic_analysis") or {}).get("RecommendedApproach") or "").strip().lower()
    tech = a.get("technical_analysis")
    if isinstance(tech, dict):
        if approach in _NON_BTP_APPROACHES:
            tech["BTPServices"] = []
        # Pricing is internal only -- strip it so it can never reach the document.
        elif isinstance(tech.get("BTPServices"), list):
            for svc in tech["BTPServices"]:
                if isinstance(svc, dict):
                    for k in ("Price", "UnitPrice", "Currency", "ServiceID", "PRICE", "UNITPRICE", "CURRENCY"):
                        svc.pop(k, None)
    return a


def generate_document(doc_type, object_name, company, project, analysis, instructions,
                      model=None):
    analysis = _sanitize_btp(analysis)
    doc, _, filename = _shell(doc_type, object_name, company, project, analysis)
    content = _body(doc_type, analysis, instructions or "")
    markdown_into_doc(content.splitlines(), doc, diagrams=_diagrams(doc_type, analysis, model))
    return _to_bytes(doc), f"{object_name}_{filename}.docx"


# Deep analysis (optional, doc-gen only): an implementation-grade extraction from
# the ABAP SOURCE, used to ground the document in real validations / entities /
# locking / messages instead of generic prose. Adapted from the Axiom Phase-1
# schema. Kept text-only (no CAP/CDS/migration concepts -- those come from the
# migration analysis that is merged separately).
_DEEP_SYS = (
    "You are an expert ABAP developer and SAP ECC analyst. Analyze the provided ABAP source and extract a "
    "precise, implementation-grade understanding of what the program does and what it uses. Focus strictly on "
    "what the code contains, infers and implies. Do NOT suggest CAP/CDS/OData/Fiori or migration steps. Output "
    "ONLY a JSON object matching the schema. When inferring anything not explicit in the code, add the word "
    "'inferred' to that item. If data is truly absent, use 'unknown' rather than guessing. Only include "
    "associations backed by visible code patterns; never invent FK relationships.")

_DEEP_SCHEMA = """{
  "functional_ability": {"summary": "2-3 sentence plain-language overview", "points": ["each business functionality in detail"]},
  "technical_ability": {"summary": "2-3 sentence technical overview", "points": ["each technical operation in detail"]},
  "integration_ability": {"summary": "2-3 sentence integration footprint", "points": ["each integration touchpoint (RFC, BAPI, IDoc, web service, file I/O)"]},
  "ui_ability": {"summary": "2-3 sentence UI overview (empty if headless)", "points": ["each UI element/interaction; empty if none"]},
  "data_model": {
    "fields_map": {"<table>": ["field (business name) used"]},
    "data_variables": {"<table>": ["work-area / internal-table variable holding that table's data"]}
  },
  "entity_definitions": [{"table_name": "", "business_name": "", "primary_keys": [{"field": "", "inferred": false}], "fields": [{"technical_name": "", "business_name": "", "abap_type": ""}]}],
  "associations": [{"from_table": "", "to_table": "", "inferred_type": "composition|association", "join_fields": [""], "code_evidence": ""}],
  "validation_matrix": [{"operation": "", "validations": [""], "field_checks": [{"field": "", "check": ""}], "dependent_checks": [""], "on_failure": {"message_class": "", "message_number": "", "message_text": "", "severity": ""}}],
  "locking_concurrency": {"locking_points": [{"function": "ENQUEUE|DEQUEUE", "lock_object": "", "timing": "", "locked_fields": [""]}], "conflict_behavior": [{"scenario": "", "program_response": ""}], "transaction_luw": "commit/rollback boundaries and BAPI_TRANSACTION_COMMIT usage"},
  "authorization_model": {"auth_objects": [{"object_name": "", "fields_checked": [{"field": "", "value_or_activity": ""}], "check_point": ""}], "user_context_fields": [{"variable": "", "source": ""}]},
  "value_help_contract": [{"field": "", "source": "", "key_fields": [""], "display_fields": [""]}],
  "errors_messages": [{"message_class": "", "message_number": "", "message_text": "", "severity": "E|W|I|S", "trigger_condition": ""}]
}"""


def extract_spec(source, model=None):
    """Extract the implementation-grade spec from ABAP source. Returns a dict, or
    None if source is empty / unparseable. Own token budget (DOC_DEEP_MAX_TOKENS)."""
    if not (source or "").strip():
        return None
    raw = complete(
        _DEEP_SYS,
        "Extract per this schema. Keep empty values (list/str/map) where data is missing. Return ONLY JSON.\n"
        f"SCHEMA:\n{_DEEP_SCHEMA}\n\nABAP Code:\n{source}",
        model=model, max_tokens=int(os.getenv("DOC_DEEP_MAX_TOKENS", "16384")))
    for token in ("```json", "```JSON", "```"):
        raw = (raw or "").replace(token, "")
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


# Backstop: strip any prompt-scaffolding the model echoed into a refine result
# (the '=== ... ===' delimiters, the reference-data labels, or a raw analysis-JSON
# blob). Belt-and-braces on top of the output-contract instruction.
_SCAFFOLD_LINE = re.compile(
    r'^\s*(?:'
    r'===.*==='                                   # "=== ... ===" delimiter lines
    r'|analysis json\b.*'                          # leaked "Analysis JSON ..." label line
    r'|(?:reference data|current document|user change request|'
    r'end current document|end reference data):?'  # a bare label ONLY (not "Reference data model")
    r'|\{\s*"basic_analysis".*'                    # a raw analysis-JSON blob line
    r')\s*$',
    re.IGNORECASE)


def _strip_leaked_scaffolding(md: str) -> str:
    if not md:
        return md
    return "\n".join(ln for ln in md.splitlines() if not _SCAFFOLD_LINE.match(ln))


def generate_chat(analysis, object_name, company, project, doc_type, chat_prompt, history,
                  deep_spec=None, current_doc=None):
    analysis = _sanitize_btp(analysis)
    # In deep mode, ground every section on the source-extracted spec (authoritative).
    extra = ""
    if deep_spec:
        extra = ("\nAUTHORITATIVE deep code analysis extracted from the ABAP SOURCE. Ground the document in "
                 "these EXACT validations, entities/fields, locking/LUW, messages and integration points; do "
                 "not contradict or omit them, and prefer them over the summary analysis where they conflict:\n"
                 + json.dumps(deep_spec) + "\n")
    # Initial generation / regenerate (no user instruction): build the document
    # SECTION BY SECTION IN PARALLEL (_body). A single 16k-token call was slow and
    # frequently timed out at the model gateway (surfacing as "service unavailable"),
    # especially on slower models. Parallel sections cut wall-time to ~one section
    # and each call is small enough to reliably complete.
    if not (chat_prompt or "").strip():
        return markdown_to_styled_html(_body(doc_type, analysis, extra))

    title, _ = DOC_TITLES.get(doc_type, DOC_TITLES["FSD"])
    # Refinement: EDIT the current document in place. The live document is sent as
    # `current_doc` (the HTML shown in the editor). We convert it to markdown and tell
    # the model to apply ONLY the requested change while preserving every other
    # section verbatim. Previously the refine call re-ran the full doc-generation
    # prompt from the analysis alone (no current draft), so it regenerated the whole
    # document and produced a thinner, different draft that lost the rich content.
    base_md = markdownify.markdownify(current_doc, heading_style="ATX") if current_doc else ""
    if base_md.strip():
        content = complete(
            SYS.format(name=title),
            "You are EDITING an existing document. Apply ONLY the user's requested change and return "
            "the COMPLETE updated document. Preserve every other section, heading, table, figure "
            "caption, number and wording EXACTLY as-is -- do NOT summarise, shorten, re-order, drop "
            "or regenerate untouched content.\n"
            f"{FORMAT_RULES}\n"
            "OUTPUT CONTRACT: return ONLY the final document as GitHub-flavoured Markdown, starting "
            "directly with its first heading. NEVER echo these instructions, the reference data, or "
            "any of the '=== ... ===' delimiters / labels ('CURRENT DOCUMENT', 'REFERENCE DATA', "
            "'Analysis JSON', 'USER CHANGE REQUEST') into the output.\n"
            f"{extra}"
            f"=== CURRENT DOCUMENT (edit this) ===\n{base_md}\n=== END CURRENT DOCUMENT ===\n\n"
            f"=== REFERENCE DATA (context only, DO NOT output) ===\n{json.dumps(analysis)}\n=== END REFERENCE DATA ===\n\n"
            f"=== USER CHANGE REQUEST ===\n{chat_prompt}",
            max_tokens=int(os.getenv("DOC_CHAT_MAX_TOKENS", "32000")))
        content = _strip_leaked_scaffolding(content)
    else:
        # No current draft available (older client): fold the instruction into the
        # recent history as a single coherent pass.
        prior = "\n".join(h.get("response", "") for h in (history or [])[-2:])
        content = complete(
            SYS.format(name=title),
            f"{PROMPTS.get(doc_type, P.FSD_Prompt)}\n{FORMAT_RULES}\n{extra}"
            f"Analysis JSON:\n{json.dumps(analysis)}\nPrior:\n{prior}\nUser:\n{chat_prompt}",
            max_tokens=int(os.getenv("DOC_CHAT_MAX_TOKENS", "32000")))
    if not content:
        raise ApiError("model_empty", "empty model response", 502)
    for token in ("```html", "```markdown", "```"):
        content = content.replace(token, "")
    return markdown_to_styled_html(content)


_VERIFY = ('Respond only JSON. Keys: "relevance" (true if the query asks to add/remove/modify the {name}, '
           'else false), "in_scope" (true if the query concerns THIS document or its contents in ANY way -- '
           'including explaining, summarising or asking about the effort estimate, sizing/t-shirt, clean-core '
           'tier, recommended approach, tables, APIs, complexity, or any section/figure of the {name} -- or '
           'the SAP object itself or SAP modernization/Clean Core. Set in_scope FALSE only for clearly '
           'unrelated topics such as general knowledge, current affairs, celebrities, sports, or math with '
           'no connection to this object), "response" (professional answer to the query within SAP/document '
           'scope). No text outside JSON.')


def chat_relevance(doc_type, chat_prompt):
    title, _ = DOC_TITLES.get(doc_type, DOC_TITLES["FSD"])
    raw = complete(SYS.format(name=title), chat_prompt + _VERIFY.format(name=title))
    for token in ("```json", "```JSON", "```"):
        raw = raw.replace(token, "")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"relevance": False, "response": raw[:500]}


def answer_question(doc_type, analysis, chat_prompt, current_doc=None):
    """Answer an in-scope QUESTION about the document/object WITHOUT modifying it.
    chat_relevance only sees the prompt, so its answer is context-free; this grounds
    the reply in the analysis and the current document (effort, tier, tables, ...)."""
    title, _ = DOC_TITLES.get(doc_type, DOC_TITLES["FSD"])
    analysis = _sanitize_btp(analysis)
    base_md = markdownify.markdownify(current_doc, heading_style="ATX") if current_doc else ""
    ctx = f"CURRENT DOCUMENT:\n{base_md}\n\n" if base_md.strip() else ""
    content = complete(
        SYS.format(name=title),
        f"Answer the user's question about this SAP object and its {title}. Be concise and "
        "specific, citing concrete figures from the analysis/document (effort hours/PD, t-shirt "
        "size, clean-core tier, table/API counts, complexity). Do NOT rewrite or return the "
        "document; just answer the question. Output brief GitHub-flavoured Markdown.\n\n"
        f"{ctx}Analysis JSON:\n{json.dumps(analysis)}\n\nQUESTION:\n{chat_prompt}",
        max_tokens=int(os.getenv("DOC_ANSWER_MAX_TOKENS", "2000")))
    return markdown_to_styled_html(content or "")


def generate_doc_from_response(doc_type, object_name, company, project, analysis, last_response):
    analysis = _sanitize_btp(analysis)
    doc, _, filename = _shell(doc_type, object_name, company, project, analysis)
    normalized = _html.unescape(last_response).encode().decode("unicode_escape")
    md = (markdownify.markdownify(normalized, heading_style="ATX")
          .replace("`", "").replace("\\-", "-").replace("\\_", "_"))
    if not md.strip():
        raise ApiError("empty_input", "empty last_response", 400)
    markdown_into_doc(md.splitlines(), doc)
    return _to_bytes(doc), f"{object_name}_{filename}.docx"
