"""Fonts shipped with the API so rendering never depends on host-installed faces.

Word resolves fonts by name from the client machine, so docx output also embeds
the family names; reportlab (SVG rasterising) needs the TTFs registered here.
"""
import os
import glob
import logging

logger = logging.getLogger(__name__)

FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")

HEADING_FONT = "General Sans"
BODY_FONT = "Instrument Sans"
MONO_FONT = "Fragment Mono"

# family -> (regular file, bold file or None)
FILES = {
    HEADING_FONT: ("GeneralSans-Regular.ttf", "GeneralSans-Bold.ttf"),
    BODY_FONT: ("InstrumentSans-Regular.ttf", "InstrumentSans-Bold.ttf"),
    MONO_FONT: ("FragmentMono-Regular.ttf", None),
}

_registered = False


def fontPath(filename):
    return os.path.join(FONT_DIR, filename)


def available():
    return {os.path.basename(p) for p in glob.glob(os.path.join(FONT_DIR, "*.ttf"))}


# reportlab needs explicit registration plus a family map for bold resolution.
def registerReportlabFonts():
    global _registered
    if _registered:
        return True
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.fonts import addMapping

        have = available()
        for family, (regular, bold) in FILES.items():
            if regular not in have:
                logger.error(f"E-FONT-missing {regular}")
                continue
            pdfmetrics.registerFont(TTFont(family, fontPath(regular)))
            bold_name = f"{family}-Bold"
            if bold and bold in have:
                pdfmetrics.registerFont(TTFont(bold_name, fontPath(bold)))
            else:
                bold_name = family
            pdfmetrics.registerFontFamily(family, normal=family, bold=bold_name,
                                          italic=family, boldItalic=bold_name)
            addMapping(family, 0, 0, family)
            addMapping(family, 1, 0, bold_name)
        _registered = True
        return True
    except Exception as e:
        logger.error(f"E-FONT-registration failed: {e}")
        return False
