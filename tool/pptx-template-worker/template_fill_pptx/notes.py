"""Speaker-notes parts for cloned slides.

Builds native PowerPoint notes-slide XML and the slide<->notesSlide<->notesMaster
relationships from a plan's ``notes`` field.
"""

from __future__ import annotations

import posixpath
import re
from xml.etree import ElementTree as ET

from .ooxml import NOTES_SLIDE_REL_TYPE, REL_NS, SLIDE_REL_TYPE, _qn, _xml_bytes
from .package import _empty_relationships_root, _max_numeric_rid


def markdown_to_plain_text(md_content: str) -> str:
    """Convert lightweight Markdown speaker notes to plain text."""

    def strip_inline_bold(text: str) -> str:
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        return re.sub(r"__(.+?)__", r"\1", text)

    lines: list[str] = []
    for line in md_content.split("\n"):
        if line.startswith("#"):
            text = strip_inline_bold(re.sub(r"^#+\s*", "", line).strip())
            if text:
                lines.extend((text, ""))
        elif line.strip().startswith("- "):
            lines.append("• " + strip_inline_bold(line.strip()[2:]))
        elif line.strip():
            lines.append(strip_inline_bold(line.strip()))
        else:
            lines.append("")

    result: list[str] = []
    previous_empty = False
    for line in lines:
        if line:
            result.append(line)
            previous_empty = False
        elif not previous_empty:
            result.append("")
            previous_empty = True
    return "\n".join(result).strip()


def create_notes_slide_xml(slide_num: int, notes_text: str) -> str:
    """Create a native PowerPoint notes-slide part."""
    del slide_num  # The slide number lives in relationships, not this XML body.
    escaped = (
        notes_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    paragraphs = []
    for paragraph in escaped.split("\n"):
        if paragraph.strip():
            paragraphs.append(
                "<a:p><a:r><a:rPr lang=\"zh-CN\" dirty=\"0\"/>"
                f"<a:t>{paragraph}</a:t></a:r></a:p>"
            )
        else:
            paragraphs.append('<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>')
    paragraphs_xml = "".join(paragraphs) or (
        '<a:p><a:endParaRPr lang="zh-CN" dirty="0"/></a:p>'
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{paragraphs_xml}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>"""


def _find_notes_master_target(entries: dict[str, bytes]) -> str | None:
    notes_master_rel_type = (
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster"
    )

    for name, data in entries.items():
        if not name.startswith("ppt/notesSlides/_rels/notesSlide") or not name.endswith(".xml.rels"):
            continue
        try:
            root = ET.fromstring(data)
        except ET.ParseError:
            continue
        for rel in root.findall(_qn(REL_NS, "Relationship")):
            if rel.attrib.get("Type") == notes_master_rel_type:
                return rel.attrib.get("Target")

    presentation_rels = entries.get("ppt/_rels/presentation.xml.rels")
    if not presentation_rels:
        return None
    try:
        root = ET.fromstring(presentation_rels)
    except ET.ParseError:
        return None
    for rel in root.findall(_qn(REL_NS, "Relationship")):
        if rel.attrib.get("Type") != notes_master_rel_type:
            continue
        target = rel.attrib.get("Target")
        if not target:
            return None
        if target.startswith("/"):
            target = target.lstrip("/")
        else:
            target = posixpath.normpath(posixpath.join("ppt", target))
        return posixpath.relpath(target, "ppt/notesSlides")
    return None


def _create_notes_rels_xml(slide_number: int, notes_master_target: str | None) -> bytes:
    root = _empty_relationships_root()
    if notes_master_target:
        ET.SubElement(
            root,
            _qn(REL_NS, "Relationship"),
            {
                "Id": "rId1",
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster",
                "Target": notes_master_target,
            },
        )
        slide_rel_id = "rId2"
    else:
        slide_rel_id = "rId1"
    ET.SubElement(
        root,
        _qn(REL_NS, "Relationship"),
        {
            "Id": slide_rel_id,
            "Type": SLIDE_REL_TYPE,
            "Target": f"../slides/slide{slide_number}.xml",
        },
    )
    return _xml_bytes(root)


def _slide_rels_with_notes(
    rels_bytes: bytes | None,
    *,
    slide_number: int,
    notes_text: str,
    notes_master_target: str | None,
) -> tuple[bytes, dict[str, bytes]]:
    root = ET.fromstring(rels_bytes) if rels_bytes else _empty_relationships_root()
    for rel in list(root.findall(_qn(REL_NS, "Relationship"))):
        if rel.attrib.get("Type") == NOTES_SLIDE_REL_TYPE:
            root.remove(rel)

    note_entries: dict[str, bytes] = {}
    notes_text = notes_text.strip()
    if notes_text:
        rel_id = f"rId{_max_numeric_rid(root) + 1}"
        notes_part = f"ppt/notesSlides/notesSlide{slide_number}.xml"
        notes_rels_part = f"ppt/notesSlides/_rels/notesSlide{slide_number}.xml.rels"
        ET.SubElement(
            root,
            _qn(REL_NS, "Relationship"),
            {
                "Id": rel_id,
                "Type": NOTES_SLIDE_REL_TYPE,
                "Target": f"../notesSlides/notesSlide{slide_number}.xml",
            },
        )
        plain_notes = markdown_to_plain_text(notes_text)
        note_entries[notes_part] = create_notes_slide_xml(slide_number, plain_notes).encode("utf-8")
        note_entries[notes_rels_part] = _create_notes_rels_xml(slide_number, notes_master_target)

    return _xml_bytes(root), note_entries
