"""Shared OOXML primitives for the template-fill pipeline.

Read-side helpers only: namespaces and content-type constants, part /
relationship resolution, EMU unit conversion, slide-shape discovery, and small
JSON readers / writers. Write-side package plumbing lives in ``package.py``.
"""

from __future__ import annotations

import json
import math
import posixpath
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
C14_NS = "http://schemas.microsoft.com/office/drawing/2007/8/2/chart"
C16_NS = "http://schemas.microsoft.com/office/drawing/2014/chart"
C16R2_NS = "http://schemas.microsoft.com/office/drawing/2015/06/chart"

SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
SLIDE_LAYOUT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
SLIDE_MASTER_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
NOTES_SLIDE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
CHART_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"
PACKAGE_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package"
SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
NOTES_SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"
CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
EMU_PER_INCH = 914400
PX_PER_INCH = 96


for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)
ET.register_namespace("", REL_NS)
ET.register_namespace("mc", MC_NS)
ET.register_namespace("c14", C14_NS)
ET.register_namespace("c16", C16_NS)
ET.register_namespace("c16r2", C16R2_NS)
ET.register_namespace("p14", P14_NS)


@dataclass(frozen=True)
class SlideRef:
    """Presentation slide reference resolved from presentation.xml.rels."""

    index: int
    rel_id: str
    target: str
    part_name: str
    rels_name: str


def _qn(namespace: str, tag: str) -> str:
    return f"{{{namespace}}}{tag}"


def _read_xml(zf: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        return ET.fromstring(zf.read(name))
    except KeyError as exc:
        raise RuntimeError(f"Missing required PPTX part: {name}") from exc


def _xml_bytes(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _normalize_part(target: str, base: str = "ppt/presentation.xml") -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    normalized = posixpath.normpath(posixpath.join(posixpath.dirname(base), target))
    return normalized.lstrip("/")


def _rels_name_for_part(part_name: str) -> str:
    parent = posixpath.dirname(part_name)
    basename = posixpath.basename(part_name)
    return posixpath.join(parent, "_rels", f"{basename}.rels")


def _emu_to_px(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return round(int(value) / EMU_PER_INCH * PX_PER_INCH)
    except ValueError:
        return None


def _parse_relationships(zf: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    rels_root = _read_xml(zf, "ppt/_rels/presentation.xml.rels")
    relationships: dict[str, dict[str, str]] = {}
    for rel in rels_root.findall(_qn(REL_NS, "Relationship")):
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        rel_type = rel.attrib.get("Type")
        if rel_id and target and rel_type:
            relationships[rel_id] = {"target": target, "type": rel_type}
    return relationships


def _parse_slide_refs(zf: zipfile.ZipFile) -> list[SlideRef]:
    pres_root = _read_xml(zf, "ppt/presentation.xml")
    relationships = _parse_relationships(zf)
    sld_id_lst = pres_root.find("p:sldIdLst", NS)
    if sld_id_lst is None:
        return []

    slides: list[SlideRef] = []
    for index, sld_id in enumerate(sld_id_lst.findall("p:sldId", NS), start=1):
        rel_id = sld_id.attrib.get(_qn(NS["r"], "id"))
        if not rel_id or rel_id not in relationships:
            continue
        rel = relationships[rel_id]
        if rel["type"] != SLIDE_REL_TYPE:
            continue
        part_name = _normalize_part(rel["target"])
        slides.append(
            SlideRef(
                index=index,
                rel_id=rel_id,
                target=rel["target"],
                part_name=part_name,
                rels_name=_rels_name_for_part(part_name),
            )
        )
    return slides


def _slide_relationships(zf: zipfile.ZipFile, rels_name: str) -> dict[str, dict[str, str]]:
    try:
        rels_root = _read_xml(zf, rels_name)
    except RuntimeError:
        return {}
    relationships: dict[str, dict[str, str]] = {}
    for rel in rels_root.findall(_qn(REL_NS, "Relationship")):
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        rel_type = rel.attrib.get("Type")
        if rel_id and target and rel_type:
            relationships[rel_id] = {"target": target, "type": rel_type}
    return relationships


def _related_part(
    zf: zipfile.ZipFile,
    owner_part: str,
    relationship_type: str,
) -> str | None:
    relationships = _slide_relationships(zf, _rels_name_for_part(owner_part))
    for relationship in relationships.values():
        if relationship.get("type") == relationship_type:
            return _normalize_part(relationship["target"], owner_part)
    return None


def _placeholder_key(container: ET.Element) -> tuple[str, str] | None:
    placeholder = container.find("p:nvSpPr/p:nvPr/p:ph", NS)
    if placeholder is None:
        return None
    placeholder_type = placeholder.attrib.get("type", "body")
    placeholder_index = placeholder.attrib.get("idx", "")
    return placeholder_type, placeholder_index


def _placeholder_map(root: ET.Element | None) -> dict[tuple[str, str], ET.Element]:
    if root is None:
        return {}
    result: dict[tuple[str, str], ET.Element] = {}
    for container in root.findall(".//p:sp", NS):
        key = _placeholder_key(container)
        if key is not None:
            result[key] = container
    return result


def _slide_inheritance_roots(
    zf: zipfile.ZipFile,
    slide_part: str,
) -> tuple[ET.Element | None, ET.Element | None]:
    layout_part = _related_part(zf, slide_part, SLIDE_LAYOUT_REL_TYPE)
    if not layout_part:
        return None, None
    layout_root = _read_xml(zf, layout_part)
    master_part = _related_part(zf, layout_part, SLIDE_MASTER_REL_TYPE)
    master_root = _read_xml(zf, master_part) if master_part else None
    return layout_root, master_root


def _inherited_container_chain(
    container: ET.Element,
    layout_root: ET.Element | None,
    master_root: ET.Element | None,
) -> list[ET.Element]:
    chain = [container]
    key = _placeholder_key(container)
    if key is None:
        return chain
    layout_container = _placeholder_map(layout_root).get(key)
    if layout_container is not None:
        chain.append(layout_container)
    master_container = _placeholder_map(master_root).get(key)
    if master_container is not None:
        chain.append(master_container)
    return chain


def _paragraph_texts(container: ET.Element) -> list[str]:
    paragraphs: list[str] = []
    for paragraph in container.findall(".//a:p", NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//a:t", NS)).strip()
        if text:
            paragraphs.append(text)
    if paragraphs:
        return paragraphs
    text = "".join(node.text or "" for node in container.findall(".//a:t", NS)).strip()
    return [text] if text else []


def _container_geometry(container: ET.Element) -> dict[str, int | None]:
    xfrm = container.find("p:spPr/a:xfrm", NS)
    if xfrm is None:
        xfrm = container.find("p:xfrm", NS)
    if xfrm is None:
        xfrm = container.find(".//a:xfrm", NS)
    if xfrm is None:
        return {"x": None, "y": None, "width": None, "height": None}
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    return {
        "x": _emu_to_px(off.attrib.get("x")) if off is not None else None,
        "y": _emu_to_px(off.attrib.get("y")) if off is not None else None,
        "width": _emu_to_px(ext.attrib.get("cx")) if ext is not None else None,
        "height": _emu_to_px(ext.attrib.get("cy")) if ext is not None else None,
    }


def _xfrm_values(element: ET.Element, *, group: bool = False) -> dict[str, float] | None:
    if group:
        properties = element.find("p:grpSpPr", NS)
        xfrm = properties.find("a:xfrm", NS) if properties is not None else None
    elif element.tag == _qn(NS["p"], "graphicFrame"):
        xfrm = element.find("p:xfrm", NS)
    else:
        properties = element.find("p:spPr", NS)
        xfrm = properties.find("a:xfrm", NS) if properties is not None else None
    if xfrm is None:
        return None
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return None
    try:
        values = {
            "x": float(off.attrib.get("x", "0")),
            "y": float(off.attrib.get("y", "0")),
            "width": float(ext.attrib.get("cx", "0")),
            "height": float(ext.attrib.get("cy", "0")),
            "rotation": float(xfrm.attrib.get("rot", "0")) / 60000,
        }
        child_off = xfrm.find("a:chOff", NS)
        child_ext = xfrm.find("a:chExt", NS)
        if child_off is not None and child_ext is not None:
            values.update(
                {
                    "child_x": float(child_off.attrib.get("x", "0")),
                    "child_y": float(child_off.attrib.get("y", "0")),
                    "child_width": float(child_ext.attrib.get("cx", "0")),
                    "child_height": float(child_ext.attrib.get("cy", "0")),
                }
            )
        return values
    except ValueError:
        return None


def _absolute_geometry(
    values: dict[str, float],
    parent: dict[str, float] | None,
) -> dict[str, int | float]:
    if parent and parent.get("child_width") and parent.get("child_height"):
        scale_x = parent["width"] / parent["child_width"]
        scale_y = parent["height"] / parent["child_height"]
        x = parent["x"] + (values["x"] - parent.get("child_x", 0.0)) * scale_x
        y = parent["y"] + (values["y"] - parent.get("child_y", 0.0)) * scale_y
        width = values["width"] * scale_x
        height = values["height"] * scale_y
    else:
        x, y, width, height = values["x"], values["y"], values["width"], values["height"]
    rotation = (values.get("rotation", 0.0) + (parent or {}).get("rotation", 0.0)) % 360
    if rotation:
        radians = math.radians(rotation)
        bounding_width = abs(width * math.cos(radians)) + abs(height * math.sin(radians))
        bounding_height = abs(width * math.sin(radians)) + abs(height * math.cos(radians))
        x += (width - bounding_width) / 2
        y += (height - bounding_height) / 2
        width, height = bounding_width, bounding_height
    return {
        "x": round(x / EMU_PER_INCH * PX_PER_INCH),
        "y": round(y / EMU_PER_INCH * PX_PER_INCH),
        "width": round(width / EMU_PER_INCH * PX_PER_INCH),
        "height": round(height / EMU_PER_INCH * PX_PER_INCH),
        "rotation": round(rotation, 2),
    }


def _slide_objects(slide_root: ET.Element) -> list[dict[str, Any]]:
    """Return drawable leaf objects in document order with absolute geometry."""
    tree = slide_root.find("p:cSld/p:spTree", NS)
    if tree is None:
        return []
    objects: list[dict[str, Any]] = []

    def walk(parent_element: ET.Element, parent_xfrm: dict[str, float] | None = None) -> None:
        for child in list(parent_element):
            local_name = child.tag.rsplit("}", 1)[-1]
            if local_name == "grpSp":
                group_xfrm = _xfrm_values(child, group=True)
                if group_xfrm is not None and parent_xfrm is not None:
                    absolute = _absolute_geometry(group_xfrm, parent_xfrm)
                    group_xfrm = {
                        **group_xfrm,
                        "x": absolute["x"] / PX_PER_INCH * EMU_PER_INCH,
                        "y": absolute["y"] / PX_PER_INCH * EMU_PER_INCH,
                        "width": absolute["width"] / PX_PER_INCH * EMU_PER_INCH,
                        "height": absolute["height"] / PX_PER_INCH * EMU_PER_INCH,
                    }
                walk(child, group_xfrm)
                continue
            if local_name not in {"sp", "pic", "cxnSp", "graphicFrame"}:
                continue
            values = _xfrm_values(child)
            shape_id, shape_name = _shape_identity(child, len(objects) + 1)
            geometry = (
                _absolute_geometry(values, parent_xfrm)
                if values is not None
                else {"x": None, "y": None, "width": None, "height": None, "rotation": 0}
            )
            has_text = any((node.text or "").strip() for node in child.findall(".//a:t", NS))
            objects.append(
                {
                    "shape_id": shape_id,
                    "shape_name": shape_name,
                    "kind": local_name,
                    "geometry": geometry,
                    "z_order": len(objects),
                    "has_text": has_text,
                }
            )

    walk(tree)
    return objects


def _text_containers(slide_root: ET.Element) -> list[ET.Element]:
    containers: list[ET.Element] = []
    for tag in ("p:sp", "p:graphicFrame"):
        for element in slide_root.findall(f".//{tag}", NS):
            if element.find(".//p:txBody", NS) is not None or element.findall(".//a:t", NS):
                containers.append(element)
    return containers


def _table_containers(slide_root: ET.Element) -> list[ET.Element]:
    return [
        frame
        for frame in slide_root.findall(".//p:graphicFrame", NS)
        if frame.find(".//a:tbl", NS) is not None
    ]


def _chart_containers(slide_root: ET.Element) -> list[ET.Element]:
    return [
        frame
        for frame in slide_root.findall(".//p:graphicFrame", NS)
        if frame.find(".//c:chart", NS) is not None
    ]


def _shape_identity(container: ET.Element, order: int) -> tuple[str, str]:
    c_nv_pr = container.find(".//p:cNvPr", NS)
    shape_id = c_nv_pr.attrib.get("id") if c_nv_pr is not None else str(order)
    shape_name = c_nv_pr.attrib.get("name") if c_nv_pr is not None else ""
    return shape_id, shape_name


def _load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON: {path}: {exc}") from exc


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
