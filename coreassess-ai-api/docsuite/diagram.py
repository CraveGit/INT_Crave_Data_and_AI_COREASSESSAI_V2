"""Flow diagrams: the model extracts nodes and edges, code lays them out.

Letting the model emit raw SVG produced dangling arrows and broken serpentines,
so generation is split: LLM returns a small JSON graph, this module computes all
geometry and connectors. Arrows are therefore always attached.
"""
import os
import io
import re
import json
import logging

from .fonts import MONO_FONT, registerReportlabFonts

logger = logging.getLogger(__name__)

VIEW_W = 680
COLS = 3
COL_W = 175
COL_GAP = 32
MARGIN_X = 24
ROW_GAP = 118
BOX_H1 = 44          # single line
BOX_H2 = 64          # title + subtitle
TOP = 24

NEUTRAL = "#494558"
CANVAS = "#ffffff"   # page background; also the plate behind edge labels
AMBER = "#b45309"
RED = "#b91c1c"
TEAL = "#0f766e"
TEXT = "#111111"

KIND_STROKE = {"process": NEUTRAL, "entity": NEUTRAL, "decision": AMBER,
               "failure": RED, "success": TEAL}

GRAPH_PROMPT = """Extract the flow of the described object as JSON. No prose, no fence.

{
  "nodes": [
    {"id":"n1","title":"Read input","subtitle":"selection screen","kind":"process"}
  ],
  "edges": [ {"from":"n1","to":"n2","label":""} ]
}

Rules:
- kind is one of: process (an action), entity (start/end/data), decision (a
  yes/no question), failure (error path), success (positive terminal).
- Max 9 nodes. Keep the main path linear; branch only for real decisions.
- title <= 18 characters. subtitle <= 21 characters, or "" if not needed.
- A decision node must have exactly two outgoing edges labelled "Yes" and "No".
- Every node except the first must be reachable; never leave an edge dangling.
- Order nodes along the main path so the sequence reads first to last.
Return ONLY the JSON object."""


def _est_width(text, size):
    return len(text) * size * 0.6


def _extract_json(text):
    if not text:
        return None
    match = re.search(r'\{.*\}', text, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _truncate(text, size, width):
    text = str(text or "")
    budget = width - 24
    if _est_width(text, size) <= budget:
        return text
    keep = max(3, int(budget / (size * 0.6)) - 1)
    return text[:keep].rstrip() + "…"


def _grid(index):
    row, col_in_row = divmod(index, COLS)
    col = col_in_row if row % 2 == 0 else (COLS - 1 - col_in_row)
    return row, col


def _box(node, row, col, y_offset=0):
    height = BOX_H2 if node.get("subtitle") else BOX_H1
    # Centre shorter boxes on the row's band. Anchoring every box to the same top
    # left a single-line Start/End sitting high against its taller neighbours.
    centering = (BOX_H2 - height) / 2
    return {**node, "x": MARGIN_X + col * (COL_W + COL_GAP),
            "y": TOP + row * ROW_GAP + y_offset + centering, "w": COL_W, "h": height,
            "row": row, "col": col}


# Serpentine for the main path. Side branches (failure/No targets) drop into the
# half-row beneath their decision so they never sit on the continuation line.
def _overlaps(box, others, pad=12):
    for other in others:
        if (box["x"] < other["x"] + other["w"] + pad
                and other["x"] < box["x"] + box["w"] + pad
                and box["y"] < other["y"] + other["h"] + pad
                and other["y"] < box["y"] + box["h"] + pad):
            return True
    return False


def _place(nodes, side_ids):
    placed, index = [], 0
    for node in nodes:
        if node.get("id") in side_ids:
            continue
        row, col = _grid(index)
        placed.append(_box(node, row, col))
        index += 1
    by_id = {n["id"]: n for n in placed if n.get("id")}

    for node in nodes:
        node_id = node.get("id")
        if node_id not in side_ids:
            continue
        parent = by_id.get(side_ids[node_id])
        if not parent:
            row, col = _grid(index)
            placed.append(_box(node, row, col))
            index += 1
            continue
        # Try below the parent, then neighbouring columns, then push further down.
        # A fixed offset stacked multiple branches on the same spot.
        # Prefer a free neighbouring column on the same offset: stacking two
        # branches in one column forces a connector through the box between them.
        candidates = [(parent["col"], ROW_GAP * 0.62)]
        for delta in (-1, 1):
            neighbour = parent["col"] + delta
            if 0 <= neighbour < COLS:
                candidates.append((neighbour, ROW_GAP * 0.62))

        for col, offset in candidates:
            box = _box(node, parent["row"], col, y_offset=offset)
            if not _overlaps(box, placed):
                placed.append(box)
                break
        else:
            row, col = _grid(index)
            placed.append(_box(node, row, col))
            index += 1
    return placed


def _shape(node):
    stroke = KIND_STROKE.get(node.get("kind", "process"), NEUTRAL)
    radius = node["h"] / 2 if node.get("kind") == "process" else 4
    return (f'<rect x="{node["x"]}" y="{node["y"]}" width="{node["w"]}" '
            f'height="{node["h"]}" rx="{radius}" '
            f'style="fill:#ffffff;stroke:{stroke};stroke-width:2.5px"/>')


def _labels(node):
    cx = node["x"] + node["w"] / 2
    out = []
    if node.get("subtitle"):
        title = _truncate(node["title"], 14, node["w"])
        sub = _truncate(node["subtitle"], 12, node["w"])
        out.append(f'<text x="{cx}" y="{node["y"] + 22}" font-size="14" '
                   f'text-anchor="middle" dominant-baseline="central" fill="{TEXT}">{_esc(title)}</text>')
        out.append(f'<text x="{cx}" y="{node["y"] + 44}" font-size="12" '
                   f'text-anchor="middle" dominant-baseline="central" fill="{TEXT}">{_esc(sub)}</text>')
    else:
        title = _truncate(node["title"], 14, node["w"])
        out.append(f'<text x="{cx}" y="{node["y"] + node["h"] / 2}" font-size="14" '
                   f'text-anchor="middle" dominant-baseline="central" fill="{TEXT}">{_esc(title)}</text>')
    return out


def _anchor(node, side):
    cx = node["x"] + node["w"] / 2
    cy = node["y"] + node["h"] / 2
    return {"left": (node["x"], cy), "right": (node["x"] + node["w"], cy),
            "top": (cx, node["y"]), "bottom": (cx, node["y"] + node["h"])}[side]


_ARROW = 7.0
LABEL_SIZE = 11
LABEL_CHAR_W = 6.0      # approx advance width of Fragment Mono at 11px


# Clip on a word boundary and mark it, so a label never reads as a broken word
# ("validati"). The plate keeps longer text legible, so the cap can be generous.
def _clip(label, limit=18):
    text = str(label or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return (cut if len(cut) >= limit // 2 else text[:limit]) + "…"


# Edge labels sat directly on the canvas, so anything drawn later (a box, a line)
# covered them. An opaque plate drawn under the text keeps it readable, and the
# candidate search nudges the plate clear of boxes while staying inside the view.
def _edge_label(x, y, text, boxes=()):
    text = str(text)
    if not text:
        return []
    width = len(text) * LABEL_CHAR_W + 8
    height = LABEL_SIZE + 5
    plate = {"x": x - width / 2, "y": y - height + 3, "w": width, "h": height}

    # Prefer down over up: shifting up ran labels off the top of the canvas, where
    # they were clipped. Candidates are filtered to ones that stay in view.
    def in_view(box):
        return (box["x"] >= 2 and box["x"] + box["w"] <= VIEW_W - 2 and box["y"] >= 2)

    for dx, dy in ((0, 0), (0, 22), (0, -20), (-width, 0), (width, 0), (0, 40)):
        candidate = {**plate, "x": plate["x"] + dx, "y": plate["y"] + dy}
        if in_view(candidate) and not _overlaps(candidate, boxes, pad=0):
            plate = candidate
            x, y = x + dx, y + dy
            break
    else:
        # Nothing clear: keep it in view even if it sits on a line.
        plate["y"] = max(plate["y"], 2)
        plate["x"] = min(max(plate["x"], 2), VIEW_W - width - 2)
        x, y = plate["x"] + width / 2, plate["y"] + height - 3

    return [f'<rect x="{plate["x"]:.1f}" y="{plate["y"]:.1f}" width="{width:.1f}" '
            f'height="{height:.1f}" rx="3" style="fill:{CANVAS};stroke:none"/>',
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{LABEL_SIZE}" '
            f'text-anchor="middle" fill="{NEUTRAL}">{_esc(text)}</text>']


# svglib ignores marker-end, so arrowheads are drawn as explicit polygons.
def _arrow_head(x, y, direction):
    dx, dy = {"right": (1, 0), "left": (-1, 0), "down": (0, 1), "up": (0, -1)}[direction]
    px, py = -dy, dx
    tip = (x + dx * 1.5, y + dy * 1.5)
    base_x, base_y = x - dx * _ARROW, y - dy * _ARROW
    left = (base_x + px * _ARROW * 0.55, base_y + py * _ARROW * 0.55)
    right = (base_x - px * _ARROW * 0.55, base_y - py * _ARROW * 0.55)
    pts = f'{tip[0]:.1f},{tip[1]:.1f} {left[0]:.1f},{left[1]:.1f} {right[0]:.1f},{right[1]:.1f}'
    return f'<polygon points="{pts}" style="fill:{NEUTRAL};stroke:none"/>'


# Connector geometry is derived from grid positions, so an arrow can never dangle.
def _connector(src, dst, label, boxes=()):
    parts = []
    stroke = f'style="fill:none;stroke:{NEUTRAL};stroke-width:2.5px"'
    same_row_band = src["row"] == dst["row"]
    if same_row_band and dst["y"] > src["y"] + src["h"] / 2:   # branch below its parent
        same_column = abs((src["x"] + src["w"] / 2) - (dst["x"] + dst["w"] / 2)) < 1
        x1, y1 = _anchor(src, "bottom")
        x2, y2 = _anchor(dst, "top")
        if same_column:
            parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" {stroke}/>')
            label_x, label_y = x1 + 18, (y1 + y2) / 2
        else:
            # Turn just below the source rather than half-way down: a mid-point
            # turn crosses the row's own left-to-right connector.
            mid = min(y1 + 20, y2 - 12)
            parts.append(f'<polyline points="{x1},{y1} {x1},{mid} {x2},{mid} {x2},{y2}" {stroke}/>')
            label_x, label_y = (x1 + x2) / 2, mid - 6
        parts.append(_arrow_head(x2, y2, "down"))
        parts.extend(_edge_label(label_x, label_y, _clip(label), boxes))
        return parts
    if src["row"] == dst["row"]:
        going_right = dst["x"] > src["x"]
        x1, y1 = _anchor(src, "right" if going_right else "left")
        x2, y2 = _anchor(dst, "left" if going_right else "right")
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" {stroke}/>')
        parts.append(_arrow_head(x2, y2, "right" if going_right else "left"))
        # Sit the label above the line in the gap between boxes, not over a box edge.
        mid_x, mid_y = (x1 + x2) / 2, y1 - 11
    elif src["col"] == dst["col"]:
        x1, y1 = _anchor(src, "bottom")
        x2, y2 = _anchor(dst, "top")
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" {stroke}/>')
        parts.append(_arrow_head(x2, y2, "down"))
        mid_x, mid_y = x1 + 16, (y1 + y2) / 2
    else:  # dog-leg: down out of source, across, then into the target top
        x1, y1 = _anchor(src, "bottom")
        x2, y2 = _anchor(dst, "top")
        mid = (y1 + y2) / 2
        parts.append(f'<polyline points="{x1},{y1} {x1},{mid} {x2},{mid} {x2},{y2}" {stroke}/>')
        parts.append(_arrow_head(x2, y2, "down"))
        mid_x, mid_y = (x1 + x2) / 2, mid - 9
    parts.extend(_edge_label(mid_x, mid_y, _clip(label), boxes))
    return parts


# Walk the main path first and append side branches immediately after their
# decision, so a branch never has to cross the continuation line.
def _order(nodes, edges):
    by_id = {n.get("id", str(i)): n for i, n in enumerate(nodes)}
    outgoing = {}
    for edge in edges:
        outgoing.setdefault(edge.get("from"), []).append(edge)
    targets = {e.get("to") for e in edges}
    start = next((n.get("id") for n in nodes if n.get("id") not in targets), None)
    if start is None:
        return nodes

    ordered, seen = [], set()
    queue = [start]
    while queue:
        node_id = queue.pop(0)
        if node_id in seen or node_id not in by_id:
            continue
        seen.add(node_id)
        ordered.append(by_id[node_id])
        outs = outgoing.get(node_id, [])
        # "No"/failure branches first so they occupy the adjacent slot.
        side = [e for e in outs if str(e.get("label", "")).lower() in ("no", "fail", "error")]
        main = [e for e in outs if e not in side]
        queue = [e.get("to") for e in side + main] + queue
    ordered += [n for n in nodes if n.get("id") not in seen]
    return ordered


def buildSvgFromGraph(graph):
    nodes = [n for n in (graph.get("nodes") or []) if n.get("title")][:9]
    if not nodes:
        return None
    edges = graph.get("edges") or []
    nodes = _order(nodes, edges)[:9]
    ids = {n.get("id") for n in nodes}
    # A side branch is a failure node, or the "No" target of a decision, that has
    # no continuation of its own.
    kinds = {n.get("id"): n.get("kind") for n in nodes}
    has_out = {e.get("from") for e in edges}
    side_ids = {}
    for edge in edges:
        target = edge.get("to")
        if target not in ids or target in side_ids:
            continue
        is_side = (kinds.get(target) == "failure"
                   or str(edge.get("label", "")).lower() in ("no", "fail", "error"))
        if is_side and target not in has_out:
            side_ids[target] = edge.get("from")
    placed = _place(nodes, side_ids)
    by_id = {n.get("id", str(i)): n for i, n in enumerate(placed)}

    # Draw order matters: lines, then boxes, then edge labels last. Labels used to
    # be emitted with their connector and were painted over by the boxes.
    lines, edge_labels = [], []
    for edge in (graph.get("edges") or []):
        src, dst = by_id.get(edge.get("from")), by_id.get(edge.get("to"))
        if src and dst and src is not dst:
            for part in _connector(src, dst, edge.get("label", ""), placed):
                (edge_labels if "<text" in part or 'rx="3"' in part else lines).append(part)

    body = list(lines)
    for node in placed:
        body.append(_shape(node))
        body += _labels(node)
    body += edge_labels

    height = max(n["y"] + n["h"] for n in placed) + 40
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W} {int(height)}">'
        f"<style>text{{font-family:'{MONO_FONT}',monospace;}}</style>"
        f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
        f'markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{NEUTRAL}"/></marker></defs>'
        + "".join(body) + "</svg>"
    )


def buildFlowSvg(complete, subject, facts, model=None):
    """Ask the model for a node/edge graph, then lay it out here."""
    try:
        raw = complete("You extract process graphs as strict JSON.",
                       f"{GRAPH_PROMPT}\n\nSubject: {subject}\nSource analysis:\n{facts}",
                       model=model, max_tokens=1200)
        graph = _extract_json(raw)
        if not graph:
            logger.error("E-DIAGRAM-no graph JSON returned")
            return None
        return buildSvgFromGraph(graph)
    except Exception as e:
        logger.error(f"E-DIAGRAM-generation failed: {e}")
        return None


ER_PROMPT = """Extract the data model as JSON. No prose, no fence.

{
  "entities": [
    {"name":"MARA","label":"Material master","fields":["MATNR","MTART","MEINS"],
     "custom":false}
  ],
  "relations": [ {"from":"MARA","to":"MARC","label":"1:N"} ]
}

Rules:
- Max 6 entities, max 5 fields each. Use the real table and field names.
- Mark custom (Z*/Y*) tables with "custom": true.
- label is the cardinality, e.g. "1:1", "1:N", "N:M".
- Only include relations between entities you listed.
Return ONLY the JSON object."""

ER_COL_W = 186          # 3 * 186 + 2 * 34 + 2 * 24 margin = 674, inside VIEW_W
ER_COL_GAP = 34
ER_ROW_GAP = 34
ER_HEADER_H = 26
ER_FIELD_H = 17


# Entity boxes are a header plus a field list, so they need their own layout
# rather than the flow grid.
def buildErSvg(graph):
    entities = [e for e in (graph.get("entities") or []) if e.get("name")][:6]
    if not entities:
        return None

    placed, per_row = [], 3
    for index, entity in enumerate(entities):
        row, col = divmod(index, per_row)
        fields = [str(f) for f in (entity.get("fields") or [])[:5]]
        height = ER_HEADER_H + max(1, len(fields)) * ER_FIELD_H + 8
        placed.append({**entity, "fields": fields, "row": row, "col": col,
                       "x": MARGIN_X + col * (ER_COL_W + ER_COL_GAP),
                       "w": ER_COL_W, "h": height})

    row_top, y = {}, TOP
    for row in sorted({p["row"] for p in placed}):
        row_top[row] = y
        y += max(p["h"] for p in placed if p["row"] == row) + ER_ROW_GAP
    for box in placed:
        box["y"] = row_top[box["row"]]

    by_name = {b["name"].upper(): b for b in placed}
    body = []

    for relation in (graph.get("relations") or []):
        src = by_name.get(str(relation.get("from", "")).upper())
        dst = by_name.get(str(relation.get("to", "")).upper())
        if not src or not dst or src is dst:
            continue
        if src["row"] == dst["row"]:
            going_right = dst["x"] > src["x"]
            x1 = src["x"] + src["w"] if going_right else src["x"]
            x2 = dst["x"] if going_right else dst["x"] + dst["w"]
            y1, y2 = src["y"] + src["h"] / 2, dst["y"] + dst["h"] / 2
            body.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
                        f'style="fill:none;stroke:{NEUTRAL};stroke-width:2.5px"/>')
            label_x, label_y = (x1 + x2) / 2, y1 - 6
        else:
            # Dog-leg through the gutter: diagonals across rows bundle together
            # and collide with the boxes and each other.
            upper, lower = (src, dst) if src["y"] < dst["y"] else (dst, src)
            x1, y1 = upper["x"] + upper["w"] / 2, upper["y"] + upper["h"]
            x2, y2 = lower["x"] + lower["w"] / 2, lower["y"]
            gutter = (y1 + y2) / 2
            body.append(f'<polyline points="{x1},{y1} {x1},{gutter} {x2},{gutter} {x2},{y2}" '
                        f'style="fill:none;stroke:{NEUTRAL};stroke-width:2.5px"/>')
            label_x, label_y = (x1 + x2) / 2, gutter - 6
        if relation.get("label"):
            body.append(f'<text x="{label_x}" y="{label_y}" font-size="11" '
                        f'text-anchor="middle" fill="{NEUTRAL}">{_esc(relation["label"])}</text>')

    for box in placed:
        stroke = AMBER if box.get("custom") else NEUTRAL
        body.append(f'<rect x="{box["x"]}" y="{box["y"]}" width="{box["w"]}" '
                    f'height="{box["h"]}" rx="4" '
                    f'style="fill:#ffffff;stroke:{stroke};stroke-width:2.5px"/>')
        body.append(f'<line x1="{box["x"]}" y1="{box["y"] + ER_HEADER_H}" '
                    f'x2="{box["x"] + box["w"]}" y2="{box["y"] + ER_HEADER_H}" '
                    f'style="stroke:{stroke};stroke-width:2.5px"/>')
        name = _truncate(box["name"], 13, box["w"])
        body.append(f'<text x="{box["x"] + box["w"] / 2}" y="{box["y"] + ER_HEADER_H / 2}" '
                    f'font-size="13" text-anchor="middle" dominant-baseline="central" '
                    f'fill="{TEXT}">{_esc(name)}</text>')
        for i, field in enumerate(box["fields"] or ["-"]):
            text_y = box["y"] + ER_HEADER_H + 10 + i * ER_FIELD_H
            body.append(f'<text x="{box["x"] + 12}" y="{text_y}" font-size="11" '
                        f'dominant-baseline="central" fill="{TEXT}">'
                        f'{_esc(_truncate(field, 11, box["w"] - 8))}</text>')

    height = max(b["y"] + b["h"] for b in placed) + 40
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W} {int(height)}">'
        f"<style>text{{font-family:'{MONO_FONT}',monospace;}}</style>"
        + "".join(body) + "</svg>"
    )


UI_PROMPT = """Extract the user interface navigation flow as JSON. No prose, no fence.

{
  "nodes": [
    {"id":"n1","title":"Launchpad","subtitle":"role tile","kind":"entity"}
  ],
  "edges": [ {"from":"n1","to":"n2","label":""} ]
}

Rules:
- Model SCREENS the user moves through, not backend steps.
- kind: entity for entry/exit points (launchpad, exit), process for a screen or
  view, decision for a user choice, failure for a validation/error screen,
  success for a confirmation screen.
- Max 8 nodes. title is the screen name, subtitle its purpose or key action.
- title <= 18 characters, subtitle <= 21 characters.
- Every node except the first must be reachable; never leave an edge dangling.
Return ONLY the JSON object."""

# UI scope follows the migration approach: retire adopts standard apps and builds
# nothing, on-stack keeps a thin embedded UI, BTP-side approaches build new.
UI_GUIDANCE = {
    "retire": ("The custom UI is retired. Model how users reach the STANDARD SAP Fiori "
               "apps listed in the analysis: launchpad, role tile, then the standard app "
               "screens. Do not invent custom screens."),
    "on-stack": ("Minimal custom UI. Model a thin on-stack surface only: a Fiori Elements "
                 "list report or an embedded ABAP screen over released CDS, with no "
                 "bespoke multi-step journey."),
    "hybrid": ("New UI on SAP BTP consuming released S/4 data. Model the full journey: "
               "launchpad entry, list view, detail/edit view, validation and confirmation."),
    "side-by-side": ("New standalone UI on SAP BTP. Model the full journey including login/entry, "
                     "list, detail, create/edit, validation and confirmation screens."),
}


def buildUiFlow(complete, subject, facts, approach="", model=None):
    """UI navigation flow; scope is driven by the migration approach."""
    guidance = UI_GUIDANCE.get((approach or "").lower(), UI_GUIDANCE["hybrid"])
    try:
        raw = complete("You extract SAP UI navigation flows as strict JSON.",
                       f"{UI_PROMPT}\n\nApproach guidance: {guidance}\n\n"
                       f"Subject: {subject}\nSource analysis:\n{facts}",
                       model=model, max_tokens=1200)
        graph = _extract_json(raw)
        return buildSvgFromGraph(graph) if graph else None
    except Exception as e:
        logger.error(f"E-DIAGRAM-UI failed: {e}")
        return None


def buildErDiagram(complete, subject, facts, model=None):
    try:
        raw = complete("You extract SAP data models as strict JSON.",
                       f"{ER_PROMPT}\n\nSubject: {subject}\nSource analysis:\n{facts}",
                       model=model, max_tokens=1200)
        graph = _extract_json(raw)
        return buildErSvg(graph) if graph else None
    except Exception as e:
        logger.error(f"E-DIAGRAM-ER failed: {e}")
        return None


def svgToPng(svg, scale=2.0):
    """Rasterise for docx via svglib+reportlab (pure pip, no system Cairo)."""
    tmp = None
    try:
        import tempfile
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM

        registerReportlabFonts()
        with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False,
                                         encoding='utf-8') as fh:
            fh.write(svg)
            tmp = fh.name
        drawing = svg2rlg(tmp)
        if drawing is None:
            return None
        drawing.scale(scale, scale)
        drawing.width *= scale
        drawing.height *= scale
        buf = io.BytesIO()
        renderPM.drawToFile(drawing, buf, fmt='PNG')
        buf.seek(0)
        return buf
    except Exception as e:
        logger.error(f"E-DIAGRAM-rasterise failed: {e}")
        return None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)
