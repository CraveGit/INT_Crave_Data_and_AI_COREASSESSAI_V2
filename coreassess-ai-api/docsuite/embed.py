"""Embed the packaged TTFs into the .docx so the document keeps its typography on
machines that do not have the fonts installed.

Word stores embedded fonts as obfuscated TTFs: the first 32 bytes are XORed with
the GUID in the fontKey attribute. Without this the file only *references* the
family name and Word silently substitutes.
"""
import uuid
import shutil
import zipfile
import logging
import tempfile
import os

from .fonts import FILES, fontPath, available

logger = logging.getLogger(__name__)

FONT_CT = "application/vnd.openxmlformats-officedocument.obfuscatedFont"
REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"


def _obfuscate(data, guid):
    """Word's font obfuscation: XOR the first 32 bytes with the reversed GUID."""
    digits = guid.replace("-", "").replace("{", "").replace("}", "")
    key = bytes.fromhex(digits)[::-1]
    head = bytes(b ^ key[i % 16] for i, b in enumerate(data[:32]))
    return head + data[32:]


def embedFonts(docx_bytes):
    """Return docx bytes with the packaged fonts embedded. On any failure the
    original bytes are returned: typography is worth less than a valid file."""
    have = available()
    plan = []          # (family, style_tag, filename)
    for family, (regular, bold) in FILES.items():
        if regular in have:
            plan.append((family, "embedRegular", regular))
        if bold and bold in have:
            plan.append((family, "embedBold", bold))
    if not plan:
        return docx_bytes

    tmp_dir = tempfile.mkdtemp(prefix="docxfont")
    try:
        src = os.path.join(tmp_dir, "in.docx")
        dst = os.path.join(tmp_dir, "out.docx")
        with open(src, "wb") as fh:
            fh.write(docx_bytes)

        with zipfile.ZipFile(src) as zin:
            items = {n: zin.read(n) for n in zin.namelist()}

        rels = []          # (rel_id, target, guid, family, tag)
        for index, (family, tag, filename) in enumerate(plan, 1):
            rel_id = f"rIdFont{index}"
            target = f"fonts/font{index}.odttf"
            guid = str(uuid.uuid4()).upper()
            with open(fontPath(filename), "rb") as fh:
                items[f"word/{target}"] = _obfuscate(fh.read(), guid)
            rels.append((rel_id, target, "{%s}" % guid, family, tag))

        items["[Content_Types].xml"] = _patch_content_types(items["[Content_Types].xml"])
        items["word/_rels/document.xml.rels"] = _patch_rels(
            items.get("word/_rels/document.xml.rels", b""), rels)
        items["word/fontTable.xml"] = _patch_font_table(
            items.get("word/fontTable.xml", b""), rels)
        items["word/settings.xml"] = _patch_settings(items.get("word/settings.xml", b""))

        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
            for name, payload in items.items():
                zout.writestr(name, payload)
        with open(dst, "rb") as fh:
            return fh.read()
    except Exception as e:
        logger.error(f"E-FONT-embed failed: {e}")
        return docx_bytes
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _patch_content_types(xml):
    text = xml.decode("utf-8")
    if "obfuscatedFont" in text:
        return xml
    entry = f'<Default Extension="odttf" ContentType="{FONT_CT}"/>'
    return text.replace("</Types>", entry + "</Types>").encode("utf-8")


def _patch_rels(xml, rels):
    text = xml.decode("utf-8") if xml else (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '</Relationships>')
    added = "".join(
        f'<Relationship Id="{rid}" Type="{REL_TYPE}" Target="{target}"/>'
        for rid, target, _guid, _family, _tag in rels)
    return text.replace("</Relationships>", added + "</Relationships>").encode("utf-8")


def _patch_font_table(xml, rels):
    text = xml.decode("utf-8") if xml else (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '</w:fonts>')
    if 'xmlns:r=' not in text:
        text = text.replace('<w:fonts ',
                            '<w:fonts xmlns:r="http://schemas.openxmlformats.org/'
                            'officeDocument/2006/relationships" ', 1)

    by_family = {}
    for rid, _target, guid, family, tag in rels:
        by_family.setdefault(family, []).append((tag, rid, guid))

    for family, parts in by_family.items():
        embeds = "".join(
            f'<w:{tag} r:id="{rid}" w:fontKey="{guid}" w:subsetted="0"/>'
            for tag, rid, guid in parts)
        marker = f'<w:font w:name="{family}">'
        if marker in text:
            text = text.replace(marker, marker + embeds, 1)
        else:
            text = text.replace("</w:fonts>",
                                f'<w:font w:name="{family}">{embeds}</w:font></w:fonts>')
    return text.encode("utf-8")


# embedTrueTypeFonts tells Word to actually use the embedded faces.
def _patch_settings(xml):
    text = xml.decode("utf-8") if xml else (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '</w:settings>')
    if "embedTrueTypeFonts" in text:
        return text.encode("utf-8")
    return text.replace("</w:settings>",
                        '<w:embedTrueTypeFonts/><w:saveSubsetFonts w:val="false"/>'
                        "</w:settings>").encode("utf-8")
