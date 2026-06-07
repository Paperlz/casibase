"""apply: replace text inside cloned slide shapes while keeping frames editable.

``_set_container_text`` is the shared text-writing primitive and is also reused
by ``table_fill`` for table-cell edits.
"""

from __future__ import annotations

import copy
from typing import Any
from xml.etree import ElementTree as ET

from .ooxml import NS, _qn, _shape_identity, _text_containers
from .selectors import _collapse_title_lines, _replacement_text
from .text_layout import estimate_text_layout


def _shape_key_maps(slide_root: ET.Element, source_slide: int) -> dict[str, ET.Element]:
    maps: dict[str, ET.Element] = {}
    for order, container in enumerate(_text_containers(slide_root), start=1):
        shape_id, shape_name = _shape_identity(container, order)
        maps[f"slot_id:s{source_slide:02d}_sh{shape_id}"] = container
        maps[f"shape_id:{shape_id}"] = container
        if shape_name:
            maps[f"shape_name:{shape_name}"] = container
    return maps


def _text_body(container: ET.Element) -> ET.Element | None:
    tx_body = container.find(".//p:txBody", NS)
    if tx_body is None:
        tx_body = container.find(".//a:txBody", NS)
    return tx_body


def _ensure_text_nodes(container: ET.Element) -> list[ET.Element]:
    text_nodes = container.findall(".//a:t", NS)
    if text_nodes:
        return text_nodes
    tx_body = _text_body(container)
    if tx_body is None:
        return []
    paragraph = tx_body.find("a:p", NS)
    if paragraph is None:
        paragraph = ET.SubElement(tx_body, _qn(NS["a"], "p"))
    run = paragraph.find("a:r", NS)
    if run is None:
        run = ET.SubElement(paragraph, _qn(NS["a"], "r"))
    text_node = run.find("a:t", NS)
    if text_node is None:
        text_node = ET.SubElement(run, _qn(NS["a"], "t"))
    return [text_node]


def _ensure_paragraph_text_node(paragraph: ET.Element) -> list[ET.Element]:
    text_nodes = paragraph.findall(".//a:t", NS)
    if text_nodes:
        return text_nodes
    run = paragraph.find("a:r", NS)
    if run is None:
        run = ET.SubElement(paragraph, _qn(NS["a"], "r"))
    text_node = run.find("a:t", NS)
    if text_node is None:
        text_node = ET.SubElement(run, _qn(NS["a"], "t"))
    return [text_node]


def _set_paragraph_text(paragraph: ET.Element, text: str) -> None:
    text_nodes = _ensure_paragraph_text_node(paragraph)
    text_nodes[0].text = text
    for node in text_nodes[1:]:
        node.text = ""


def _set_normal_autofit(container: ET.Element, *, single_line: bool) -> None:
    tx_body = _text_body(container)
    if tx_body is None:
        return
    body = tx_body.find("a:bodyPr", NS)
    if body is None:
        body = ET.Element(_qn(NS["a"], "bodyPr"))
        tx_body.insert(0, body)
    for tag in ("a:noAutofit", "a:spAutoFit", "a:normAutofit"):
        child = body.find(tag, NS)
        if child is not None:
            body.remove(child)
    body.append(ET.Element(_qn(NS["a"], "normAutofit")))
    if single_line:
        body.set("wrap", "none")
    elif body.attrib.get("wrap") == "none":
        body.set("wrap", "square")


def _scaled_size(raw_size: str | None, scale: float, fallback_size: int) -> str:
    try:
        size = int(raw_size) if raw_size else fallback_size
    except ValueError:
        size = fallback_size
    return str(max(round(size * scale), 1))


def _set_explicit_font_scale(
    container: ET.Element,
    *,
    scale: float,
    base_font_size_px: float,
) -> None:
    fallback_size = max(round(base_font_size_px * 72 / 96 * 100), 1)
    for tag in ("a:rPr", "a:defRPr", "a:endParaRPr"):
        for properties in container.findall(f".//{tag}", NS):
            properties.set("sz", _scaled_size(properties.attrib.get("sz"), scale, fallback_size))
    for run in container.findall(".//a:r", NS) + container.findall(".//a:fld", NS):
        properties = run.find("a:rPr", NS)
        if properties is None:
            properties = ET.Element(_qn(NS["a"], "rPr"))
            run.insert(0, properties)
            properties.set("sz", _scaled_size(None, scale, fallback_size))


def _replace_with_paragraphs(container: ET.Element, lines: list[str]) -> None:
    tx_body = _text_body(container)
    if tx_body is None:
        raise RuntimeError("Matched shape does not contain a text body")
    paragraphs = tx_body.findall("a:p", NS)
    if not paragraphs:
        paragraph = ET.SubElement(tx_body, _qn(NS["a"], "p"))
        _set_paragraph_text(paragraph, lines[0] if lines else "")
        return

    templates = [copy.deepcopy(paragraph) for paragraph in paragraphs]
    for paragraph in paragraphs:
        tx_body.remove(paragraph)
    for index, line in enumerate(lines or [""]):
        template_index = min(index, len(templates) - 1)
        paragraph = copy.deepcopy(templates[template_index])
        _set_paragraph_text(paragraph, line)
        tx_body.append(paragraph)


def _is_single_line_title(container: ET.Element) -> bool:
    placeholder = container.find("p:nvSpPr/p:nvPr/p:ph", NS)
    if placeholder is not None and placeholder.attrib.get("type") in {"title", "ctrTitle"}:
        return True
    c_nv_pr = container.find(".//p:cNvPr", NS)
    name = c_nv_pr.attrib.get("name", "").lower() if c_nv_pr is not None else ""
    if "title" in name or "标题" in name:
        return len(container.findall(".//a:p", NS)) <= 1
    body = _text_body(container)
    body_properties = body.find("a:bodyPr", NS) if body is not None else None
    return (
        body_properties is not None
        and body_properties.attrib.get("wrap") == "none"
        and len(container.findall(".//a:p", NS)) <= 1
    )


def _set_container_text(
    container: ET.Element,
    text: str,
    *,
    preserve_line_breaks: bool = True,
    single_line: bool = False,
    slot: dict[str, Any] | None = None,
) -> None:
    if single_line and not preserve_line_breaks:
        text = _collapse_title_lines(text)
    lines = text.splitlines() or [""]
    if len(lines) > 1:
        _replace_with_paragraphs(container, lines)
    else:
        text_nodes = _ensure_text_nodes(container)
        if not text_nodes:
            raise RuntimeError("Matched shape does not contain a text body")
        if len(lines) <= len(text_nodes):
            for index, node in enumerate(text_nodes):
                node.text = lines[index] if index < len(lines) else ""
        else:
            text_nodes[0].text = text
            for node in text_nodes[1:]:
                node.text = ""
    _set_normal_autofit(container, single_line=single_line)
    if slot:
        metrics = slot.get("text_metrics") or {}
        layout = estimate_text_layout(
            text=text,
            role=str(slot.get("role") or ""),
            old_paragraphs=int(slot.get("paragraph_count") or 1),
            geometry=slot.get("geometry") or {},
            text_metrics=metrics,
            single_line=single_line,
        )
        scale = layout.get("scale")
        base_font_size = metrics.get("font_size_px")
        final_font_size = layout.get("font_size_px")
        if (
            isinstance(scale, (int, float))
            and scale > 0
            and (not isinstance(base_font_size, (int, float)) or base_font_size <= 0)
            and isinstance(final_font_size, (int, float))
        ):
            base_font_size = float(final_font_size) / float(scale)
        if isinstance(scale, (int, float)) and isinstance(base_font_size, (int, float)) and base_font_size > 0:
            _set_explicit_font_scale(
                container,
                scale=float(scale),
                base_font_size_px=float(base_font_size),
            )


def _apply_replacements_to_slide(
    slide_root: ET.Element,
    *,
    source_slide: int,
    replacements: list[dict[str, Any]],
    slots: list[dict[str, Any]] | None = None,
) -> None:
    maps = _shape_key_maps(slide_root, source_slide)
    slot_maps: dict[str, dict[str, Any]] = {}
    for slot in slots or []:
        for field in ("slot_id", "shape_id", "shape_name"):
            if slot.get(field):
                slot_maps[f"{field}:{slot[field]}"] = slot
    errors: list[str] = []
    for replacement in replacements:
        selectors = []
        if replacement.get("slot_id"):
            selectors.append(f"slot_id:{replacement['slot_id']}")
        if replacement.get("shape_id"):
            selectors.append(f"shape_id:{replacement['shape_id']}")
        if replacement.get("shape_name"):
            selectors.append(f"shape_name:{replacement['shape_name']}")
        container = next((maps[key] for key in selectors if key in maps), None)
        if container is None:
            if replacement.get("optional"):
                continue
            errors.append(", ".join(selectors) or "<missing selector>")
            continue
        slot = next((slot_maps[key] for key in selectors if key in slot_maps), None)
        single_line = bool(slot.get("single_line")) if slot else _is_single_line_title(container)
        _set_container_text(
            container,
            _replacement_text(replacement),
            preserve_line_breaks=bool(replacement.get("preserve_line_breaks", False)) or not single_line,
            single_line=single_line and not bool(replacement.get("preserve_line_breaks", False)),
            slot=slot,
        )
    if errors:
        raise RuntimeError(f"Missing replacement target(s) on slide {source_slide}: {'; '.join(errors)}")
