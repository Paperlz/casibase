"""analyze: read a PPTX as a reusable slide library of text / table / chart slots."""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from .chart_read import empty_chart_data, read_chart_data
from .ooxml import (
    CHART_REL_TYPE,
    NS,
    SlideRef,
    _chart_containers,
    _container_geometry,
    _emu_to_px,
    _inherited_container_chain,
    _normalize_part,
    _paragraph_texts,
    _parse_slide_refs,
    _read_xml,
    _qn,
    _shape_identity,
    _slide_objects,
    _slide_relationships,
    _slide_inheritance_roots,
    _table_containers,
    _text_containers,
)

THANKS_KEYWORDS = ("thank", "thanks", "q&a", "qa", "contact", "致谢", "谢谢", "感谢", "答疑", "联系方式")
TOC_KEYWORDS = ("agenda", "contents", "content", "outline", "目录", "议程")
CHAPTER_KEYWORDS = ("chapter", "part", "section", "章节", "部分")


def _analyze_tables(slide_root: ET.Element, source_slide: int) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []
    for order, container in enumerate(_table_containers(slide_root), start=1):
        shape_id, shape_name = _shape_identity(container, order)
        frame_geometry = _container_geometry(container)
        rows: list[dict[str, Any]] = []
        max_columns = 0
        table_rows = container.findall(".//a:tbl/a:tr", NS)
        total_height = sum(int(row.attrib.get("h", "0")) for row in table_rows)
        row_y = int(frame_geometry.get("y") or 0)
        for row_index, row in enumerate(table_rows):
            cells: list[dict[str, Any]] = []
            row_height = (
                round((int(row.attrib.get("h", "0")) / total_height) * int(frame_geometry.get("height") or 0))
                if total_height > 0
                else round(int(frame_geometry.get("height") or 0) / max(len(table_rows), 1))
            )
            row_cells = row.findall("a:tc", NS)
            cell_width = round(int(frame_geometry.get("width") or 0) / max(len(row_cells), 1))
            for col_index, cell in enumerate(row_cells):
                paragraphs = _paragraph_texts(cell)
                cells.append(
                    {
                        "row": row_index,
                        "col": col_index,
                        "text": "\n".join(paragraphs),
                        "paragraph_count": len(paragraphs),
                        "geometry": {
                            "x": int(frame_geometry.get("x") or 0) + col_index * cell_width,
                            "y": row_y,
                            "width": cell_width,
                            "height": row_height,
                        },
                        "text_metrics": _text_metrics([cell], len(paragraphs)),
                    }
                )
            max_columns = max(max_columns, len(cells))
            rows.append({"row": row_index, "cells": cells})
            row_y += row_height
        tables.append(
            {
                "table_id": f"s{source_slide:02d}_tbl{shape_id}",
                "shape_id": shape_id,
                "shape_name": shape_name,
                "geometry": frame_geometry,
                "row_count": len(rows),
                "column_count": max_columns,
                "rows": rows,
            }
        )
    return tables


def _analyze_charts(zf: zipfile.ZipFile, slide_root: ET.Element, slide_ref: SlideRef) -> list[dict[str, Any]]:
    charts: list[dict[str, Any]] = []
    relationships = _slide_relationships(zf, slide_ref.rels_name)
    for order, container in enumerate(_chart_containers(slide_root), start=1):
        shape_id, _shape_name = _shape_identity(container, order)
        chart = container.find(".//c:chart", NS)
        rel_id = chart.attrib.get(_qn(NS["r"], "id")) if chart is not None else ""
        payload: dict[str, Any] = {"chart_id": f"s{slide_ref.index:02d}_ch{shape_id}"}
        payload.update(empty_chart_data())
        rel = relationships.get(rel_id)
        if rel and rel.get("type") == CHART_REL_TYPE:
            chart_part = _normalize_part(rel["target"], slide_ref.part_name)
            try:
                payload.update(read_chart_data(_read_xml(zf, chart_part)))
            except RuntimeError:
                payload.update(empty_chart_data())
        charts.append(payload)
    return charts


def _placeholder_type(container: ET.Element) -> str:
    placeholder = container.find("p:nvSpPr/p:nvPr/p:ph", NS)
    return placeholder.attrib.get("type", "body") if placeholder is not None else ""


def _slot_role(slot: dict[str, Any], container: ET.Element) -> str:
    text = str(slot.get("text") or "")
    name = str(slot.get("shape_name") or "").lower()
    placeholder_type = _placeholder_type(container)
    metrics = slot.get("text_metrics") or {}
    geometry = slot.get("geometry") or {}
    paragraph_count = int(slot.get("paragraph_count") or 0)
    if placeholder_type in {"title", "ctrTitle"} or "title" in name or "标题" in name:
        return "title_candidate"
    if (
        metrics.get("font_size_px") is not None
        and metrics["font_size_px"] >= 30
        and isinstance(geometry.get("y"), int)
        and geometry["y"] < 100
        and isinstance(geometry.get("width"), int)
        and geometry["width"] >= 300
    ):
        return "title_candidate"
    if placeholder_type in {"body", "subTitle", "obj"}:
        return "body_candidate"
    if paragraph_count > 1:
        return "body_candidate"
    if metrics.get("wrap") != "none" and (
        len(text) >= 36 or slot.get("text_node_count", 0) >= 3
    ):
        return "body_candidate"
    if len(text) >= 72:
        return "body_candidate"
    return "label_candidate"


def _single_line_policy(role: str, text: str, text_metrics: dict[str, Any]) -> bool:
    return (
        role in {"title_candidate", "label_candidate"}
        and "\n" not in text
        and text_metrics.get("wrap") == "none"
    )


def _font_size_px(containers: list[ET.Element]) -> float | None:
    sizes: list[float] = []
    for container in containers:
        for node in container.findall(".//a:rPr", NS) + container.findall(".//a:defRPr", NS):
            raw_size = node.attrib.get("sz")
            if not raw_size:
                continue
            try:
                sizes.append(int(raw_size) / 100 * 96 / 72)
            except ValueError:
                continue
        if sizes:
            break
    if not sizes:
        return None
    # Use the largest explicit run size as the conservative capacity baseline.
    return round(max(sizes), 2)


def _body_properties(containers: list[ET.Element]) -> dict[str, Any]:
    wrap = None
    autofit = None
    margins: dict[str, int] = {}
    anchor = None
    alignment = None
    for container in containers:
        body = container.find(".//a:bodyPr", NS)
        if body is None:
            continue
        if wrap is None and "wrap" in body.attrib:
            wrap = body.attrib["wrap"]
        if anchor is None and body.attrib.get("anchor"):
            anchor = body.attrib["anchor"]
        if autofit is None:
            if body.find("a:normAutofit", NS) is not None:
                autofit = "normal"
            elif body.find("a:spAutoFit", NS) is not None:
                autofit = "shape"
            elif body.find("a:noAutofit", NS) is not None:
                autofit = "none"
        for field, attribute in (("left", "lIns"), ("right", "rIns"), ("top", "tIns"), ("bottom", "bIns")):
            value = _emu_to_px(body.attrib.get(attribute)) if field not in margins else None
            if value is not None and field not in margins:
                margins[field] = value
        if alignment is None:
            paragraph_properties = container.find(".//a:pPr", NS)
            if paragraph_properties is not None and paragraph_properties.attrib.get("algn"):
                alignment = paragraph_properties.attrib["algn"]
    return {
        "wrap": wrap or "square",
        "autofit": autofit or "none",
        "margins_px": margins,
        "anchor": anchor or "t",
        "alignment": alignment or "l",
    }


def _line_spacing_metrics(containers: list[ET.Element]) -> dict[str, float | None]:
    for container in containers:
        for paragraph_properties in container.findall(".//a:pPr", NS):
            percent = paragraph_properties.find("a:lnSpc/a:spcPct", NS)
            if percent is not None:
                try:
                    return {
                        "line_spacing": int(percent.attrib["val"]) / 100000,
                        "line_spacing_px": None,
                    }
                except (KeyError, ValueError):
                    pass
            points = paragraph_properties.find("a:lnSpc/a:spcPts", NS)
            if points is not None:
                try:
                    return {
                        "line_spacing": None,
                        "line_spacing_px": int(points.attrib["val"]) / 100 * 96 / 72,
                    }
                except (KeyError, ValueError):
                    pass
    return {"line_spacing": None, "line_spacing_px": None}


def _text_metrics(containers: list[ET.Element], paragraph_count: int) -> dict[str, Any]:
    font_size_px = _font_size_px(containers)
    properties = _body_properties(containers)
    return {
        "font_size_px": font_size_px,
        "paragraph_count": paragraph_count,
        **_line_spacing_metrics(containers),
        **properties,
    }


def _classify_page_type(index: int, total: int, text: str, slots: list[dict[str, Any]]) -> str:
    normalized = text.lower()
    if index == 1:
        return "cover_candidate"
    if index == total or any(keyword in normalized for keyword in THANKS_KEYWORDS):
        return "ending_candidate"
    if any(keyword in normalized for keyword in TOC_KEYWORDS):
        return "toc_candidate"
    if any(keyword in normalized for keyword in CHAPTER_KEYWORDS):
        return "chapter_candidate"
    if len(slots) <= 2 and len(text) <= 80:
        return "chapter_candidate"
    return "content_candidate"


def _canvas_px(pres_root: ET.Element) -> dict[str, int | None]:
    size = pres_root.find("p:sldSz", NS)
    if size is None:
        return {"width": None, "height": None}
    return {
        "width": _emu_to_px(size.attrib.get("cx")),
        "height": _emu_to_px(size.attrib.get("cy")),
    }


def analyze_pptx(pptx_path: Path) -> dict[str, Any]:
    """Extract a slide library with text replacement slots."""
    with zipfile.ZipFile(pptx_path) as zf:
        pres_root = _read_xml(zf, "ppt/presentation.xml")
        slide_refs = _parse_slide_refs(zf)
        slides: list[dict[str, Any]] = []
        for slide_ref in slide_refs:
            slide_root = _read_xml(zf, slide_ref.part_name)
            layout_root, master_root = _slide_inheritance_roots(zf, slide_ref.part_name)
            slide_objects = _slide_objects(slide_root)
            object_by_id = {item["shape_id"]: item for item in slide_objects}
            slots: list[dict[str, Any]] = []
            for order, container in enumerate(_text_containers(slide_root), start=1):
                shape_id, shape_name = _shape_identity(container, order)
                paragraphs = _paragraph_texts(container)
                text = "\n".join(paragraphs)
                inherited_chain = _inherited_container_chain(container, layout_root, master_root)
                geometry = next(
                    (
                        candidate
                        for candidate in (_container_geometry(item) for item in inherited_chain)
                        if candidate.get("width") is not None and candidate.get("height") is not None
                    ),
                    _container_geometry(container),
                )
                text_metrics = _text_metrics(inherited_chain, len(paragraphs))
                slot_base = {
                        "text": text,
                        "shape_name": shape_name,
                        "geometry": geometry,
                        "text_node_count": len(container.findall(".//a:t", NS)),
                        "paragraph_count": len(paragraphs),
                        "text_metrics": text_metrics,
                }
                role = _slot_role(slot_base, container)
                object_info = object_by_id.get(shape_id, {})
                slots.append(
                    {
                        "slot_id": f"s{slide_ref.index:02d}_sh{shape_id}",
                        "shape_id": shape_id,
                        "shape_name": shape_name,
                        "role": role,
                        "text": text,
                        "paragraph_count": len(paragraphs),
                        "geometry": geometry,
                        "text_metrics": text_metrics,
                        "single_line": _single_line_policy(role, text, text_metrics),
                        "z_order": object_info.get("z_order"),
                    }
                )
            slots_by_shape = {str(slot.get("shape_id") or ""): slot for slot in slots}
            for item in slide_objects:
                slot = slots_by_shape.get(str(item.get("shape_id") or ""))
                if slot is not None:
                    item["geometry"] = slot["geometry"]
                    item["has_text"] = bool(slot.get("text"))

            tables = _analyze_tables(slide_root, slide_ref.index)
            charts = _analyze_charts(zf, slide_root, slide_ref)
            slide_text = "\n".join(slot["text"] for slot in slots if slot["text"])
            slides.append(
                {
                    "slide_index": slide_ref.index,
                    "page_type": _classify_page_type(slide_ref.index, len(slide_refs), slide_text, slots),
                    "text_summary": slide_text[:500],
                    "slots": slots,
                    "tables": tables,
                    "charts": charts,
                    "objects": slide_objects,
                }
            )

    return {
        "schema": "template_fill_pptx_library.v1",
        "source_pptx": str(pptx_path),
        "slide_count": len(slides),
        "canvas_px": _canvas_px(pres_root),
        "slides": slides,
        "plan_contract": {
            "schema": "template_fill_pptx_plan.v1",
            "slides": [
                {
                    "source_slide": 1,
                    "purpose": "封面 / 章节 / 内容 / 结尾",
                    "replacements": [
                        {
                            "slot_id": "s01_sh2",
                            "text": "替换后的文字",
                            "preserve_line_breaks": False,
                        }
                    ],
                    "table_edits": [
                        {
                            "table_id": "s01_tbl3",
                            "cells": [{"row": 0, "col": 0, "text": "替换后的单元格"}],
                        }
                    ],
                    "chart_edits": [
                        {
                            "chart_id": "s01_ch4",
                            "categories": ["A", "B"],
                            "series": [{"name": "系列1", "values": [1, 2]}],
                        }
                    ],
                }
            ],
        },
    }
