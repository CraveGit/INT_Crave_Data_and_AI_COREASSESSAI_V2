"""Shared document styling. Mirrors the Obsidian export theme: Lora headings,
Instrument Sans body, generous line-height, no table header fill."""
import os

from docx.shared import Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ASSETS = os.path.join(os.path.dirname(__file__), "assets")

# Families are packaged under assets/fonts (see docsuite.fonts).
HEADING_FONT = "General Sans"
BODY_FONT = "Instrument Sans"
MONO_FONT = "Fragment Mono"

HEADING_COLOR = RGBColor(0x49, 0x45, 0x58)
BODY_COLOR = RGBColor(0x11, 0x11, 0x11)
MUTED_COLOR = RGBColor(0x77, 0x74, 0x82)
RULE_COLOR = "AAAAAA"
BORDER_COLOR = "D8D8D4"

# Scaled from the Obsidian px ramp (48/40/32/28/22/18) to A4-appropriate points.
HEADING_SIZES = {1: 22, 2: 17, 3: 14, 4: 12.5, 5: 11.5, 6: 11}
# H1 starts its own page, so it needs no lead-in; deeper levels get real air.
HEADING_SPACE_BEFORE = {1: 0, 2: 22, 3: 16, 4: 13, 5: 11, 6: 10}
HEADING_SPACE_AFTER = {1: 14, 2: 9, 3: 7, 4: 6, 5: 5, 6: 5}
BODY_SIZE = 10.5
TABLE_SIZE = 9.5
LINE_SPACING = 1.4          # --line-height-normal
PARA_SPACE_AFTER = 7        # --p-spacing .9rem


def _setStyleFont(style, font, size, color, bold=False):
    style.font.name = font
    style.font.size = Pt(size)
    style.font.color.rgb = color
    style.font.bold = bold
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs'):
        rfonts.set(qn(attr), font)


def applyBaseStyles(doc):
    normal = doc.styles['Normal']
    _setStyleFont(normal, BODY_FONT, BODY_SIZE, BODY_COLOR)
    pfmt = normal.paragraph_format
    pfmt.line_spacing = LINE_SPACING
    pfmt.space_after = Pt(PARA_SPACE_AFTER)

    for level, size in HEADING_SIZES.items():
        name = f'Heading {level}'
        if name not in [s.name for s in doc.styles]:
            continue
        style = doc.styles[name]
        _setStyleFont(style, HEADING_FONT, size, HEADING_COLOR, bold=True)
        style.paragraph_format.space_before = Pt(HEADING_SPACE_BEFORE.get(level, 8))
        style.paragraph_format.space_after = Pt(HEADING_SPACE_AFTER.get(level, 5))
        style.paragraph_format.keep_with_next = True
