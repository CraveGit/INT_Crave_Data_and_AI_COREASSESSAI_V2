"""Section contract per document type.

MANDATORY sections are always emitted, in this order, even when the analysis is
thin (the model writes "Not applicable"). OPTIONAL sections appear only when the
analysis actually carries the data, so the TOC never lists empty chapters.
"""

# key -> (heading text, analysis path that must be non-empty for OPTIONAL ones)
MANDATORY = "mandatory"
OPTIONAL = "optional"

FSD = [
    (MANDATORY, "Introduction", None),
    (MANDATORY, "Business Context", None),
    (MANDATORY, "Functional Requirements", None),
    (MANDATORY, "Process Flow", None),
    (MANDATORY, "Clean Core Assessment", None),
    (MANDATORY, "Recommended Approach", None),
    (OPTIONAL, "Standard SAP Applications", "highlvl_s4_analysis.SAPStandardFioriApps"),
    (OPTIONAL, "Standard APIs", "highlvl_s4_analysis.SAPStandardAPIs"),
    (OPTIONAL, "Interfaces and Events", "interface_analysis.IDocs"),
    (OPTIONAL, "Authorization", "technical_analysis.SQLAnalysis.AuthorizationChecks"),
    (MANDATORY, "Effort and Sizing", None),
    (MANDATORY, "Assumptions and Risks", None),
    (MANDATORY, "Conclusion", None),
]

TSD = [
    (MANDATORY, "Introduction", None),
    (MANDATORY, "Technical Overview", None),
    (MANDATORY, "Object Inventory", None),
    (MANDATORY, "Data Model", None),
    (MANDATORY, "Process Flow", None),
    (MANDATORY, "Processing Logic", None),
    (MANDATORY, "Clean Core Findings", None),
    (MANDATORY, "Target Design", None),
    (OPTIONAL, "CDS Views", "technical_analysis.SQLAnalysis.TablesCDSViews"),
    (OPTIONAL, "Released APIs", "highlvl_s4_analysis.SAPStandardAPIs"),
    (OPTIONAL, "Interfaces and Events", "interface_analysis.StandardAPIs"),
    (OPTIONAL, "BTP Services", "technical_analysis.BTPServices"),
    (MANDATORY, "Error Handling", None),
    (MANDATORY, "Testing Considerations", None),
    (MANDATORY, "Conclusion", None),
]

BBD = [
    (MANDATORY, "Executive Summary", None),
    (MANDATORY, "Business Objective", None),
    (MANDATORY, "Current State", None),
    (MANDATORY, "Solution Architecture", None),
    (MANDATORY, "Target State", None),
    (MANDATORY, "Clean Core Alignment", None),
    (OPTIONAL, "BTP Services", "technical_analysis.BTPServices"),
    (OPTIONAL, "Standard Applications", "highlvl_s4_analysis.SAPStandardFioriApps"),
    (MANDATORY, "Implementation Roadmap", None),
    (MANDATORY, "Effort and Investment", None),
    (MANDATORY, "Risks and Mitigations", None),
    (MANDATORY, "Conclusion", None),
]

BY_TYPE = {"FSD": FSD, "TSD": TSD, "BBD": BBD}


def _resolve(analysis, path):
    node = analysis
    for part in path.split('.'):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


# Sections that recommend SAP BTP side-by-side services -- excluded outright for
# on-stack/retire, which stay on the ABAP stack.
_BTP_SECTIONS = {"BTP Services"}
_NON_BTP_APPROACHES = {"on-stack", "on stack", "onstack", "retire"}


# An optional section earns its place only when its backing data is non-empty.
def planSections(doc_type, analysis):
    approach = str(((analysis or {}).get("basic_analysis") or {}).get("RecommendedApproach") or "").strip().lower()
    no_btp = approach in _NON_BTP_APPROACHES
    plan = []
    for kind, title, path in BY_TYPE.get(doc_type, FSD):
        if no_btp and title in _BTP_SECTIONS:
            continue
        if kind is MANDATORY:
            plan.append(title)
        elif path and _resolve(analysis or {}, path):
            plan.append(title)
    return plan


def sectionInstruction(doc_type, analysis):
    titles = planSections(doc_type, analysis)
    numbered = "\n".join(f"{i}. {t}" for i, t in enumerate(titles, 1))
    return (f"Use exactly these level-1 sections, in this order, numbered as shown. "
            f"Do not add or rename sections:\n{numbered}\n")
