"""check-plan: compare planned text / table / chart edits against source capacity."""

from __future__ import annotations

from typing import Any

from .selectors import (
    _chart_selectors,
    _collapse_title_lines,
    _replacement_selectors,
    _replacement_text,
    _table_selectors,
)
from .text_layout import (
    estimate_text_layout,
    fallback_font_size_px,
    intersection_area,
    occupied_rect,
    visual_width,
)


def _slot_lookup(library: dict[str, Any]) -> dict[tuple[int, str], dict[str, Any]]:
    lookup: dict[tuple[int, str], dict[str, Any]] = {}
    for slide in library.get("slides", []):
        slide_index = int(slide.get("slide_index", 0))
        for slot in slide.get("slots", []):
            if slot.get("slot_id"):
                lookup[(slide_index, f"slot_id:{slot['slot_id']}")] = slot
            if slot.get("shape_id"):
                lookup[(slide_index, f"shape_id:{slot['shape_id']}")] = slot
            if slot.get("shape_name"):
                lookup[(slide_index, f"shape_name:{slot['shape_name']}")] = slot
    return lookup


def _slide_lookup(library: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return {
        int(slide.get("slide_index", 0)): slide
        for slide in library.get("slides", [])
    }


def _table_lookup(library: dict[str, Any]) -> dict[tuple[int, str], dict[str, Any]]:
    lookup: dict[tuple[int, str], dict[str, Any]] = {}
    for slide in library.get("slides", []):
        slide_index = int(slide.get("slide_index", 0))
        for table in slide.get("tables", []):
            if table.get("table_id"):
                lookup[(slide_index, f"table_id:{table['table_id']}")] = table
            if table.get("shape_id"):
                lookup[(slide_index, f"shape_id:{table['shape_id']}")] = table
            if table.get("shape_name"):
                lookup[(slide_index, f"shape_name:{table['shape_name']}")] = table
    return lookup


def _chart_lookup(library: dict[str, Any]) -> dict[tuple[int, str], dict[str, Any]]:
    lookup: dict[tuple[int, str], dict[str, Any]] = {}
    for slide in library.get("slides", []):
        slide_index = int(slide.get("slide_index", 0))
        for chart in slide.get("charts", []):
            if chart.get("chart_id"):
                lookup[(slide_index, f"chart_id:{chart['chart_id']}")] = chart
            if chart.get("shape_id"):
                lookup[(slide_index, f"shape_id:{chart['shape_id']}")] = chart
            if chart.get("shape_name"):
                lookup[(slide_index, f"shape_name:{chart['shape_name']}")] = chart
    return lookup


def _table_cell(table: dict[str, Any], row: int, col: int) -> dict[str, Any] | None:
    for row_item in table.get("rows", []):
        if int(row_item.get("row", -1)) != row:
            continue
        return next(
            (cell for cell in row_item.get("cells", []) if int(cell.get("col", -1)) == col),
            None,
        )
    return None


def _visual_width(text: str) -> float:
    return visual_width(text)


def _display_width(value: float) -> int | float:
    return int(value) if value.is_integer() else round(value, 1)


def _fallback_font_size_px(role: str, geometry: dict[str, Any], old_paragraphs: int) -> float:
    return fallback_font_size_px(role, geometry, old_paragraphs)


def _geometry_capacity(
    *,
    role: str,
    old_paragraphs: int,
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
) -> tuple[float, int] | None:
    width = geometry.get("width")
    height = geometry.get("height")
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        return None

    font_size_px = text_metrics.get("font_size_px")
    if not isinstance(font_size_px, (int, float)) or font_size_px <= 0:
        font_size_px = _fallback_font_size_px(role, geometry, old_paragraphs)

    margins = text_metrics.get("margins_px") or {}
    horizontal_padding = margins.get("left", 12) + margins.get("right", 12)
    vertical_padding = margins.get("top", 4) + margins.get("bottom", 4)
    usable_width = max(width - horizontal_padding, width * 0.72, 1)
    usable_height = max(height - vertical_padding, height * 0.72, 1)
    line_spacing = text_metrics.get("line_spacing")
    if not isinstance(line_spacing, (int, float)) or line_spacing <= 0:
        line_spacing = 1.25
    absolute_line_spacing = text_metrics.get("line_spacing_px")
    if isinstance(absolute_line_spacing, (int, float)) and absolute_line_spacing > 0:
        line_height = absolute_line_spacing
    else:
        line_height = max(font_size_px * line_spacing, 1.0)
    max_lines = max(int(usable_height / line_height), 1)
    latin_units_per_line = usable_width / max(font_size_px * 0.52, 1)
    if role == "label_candidate":
        latin_units_per_line *= 0.7
    elif role == "title_candidate":
        latin_units_per_line *= 0.85
    return latin_units_per_line, max_lines


def _estimated_scale(
    *,
    text: str,
    role: str,
    old_paragraphs: int,
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
    force_single_line: bool,
) -> float | None:
    return estimate_text_layout(
        text=text,
        role=role,
        old_paragraphs=old_paragraphs,
        geometry=geometry,
        text_metrics=text_metrics,
        single_line=force_single_line,
    )["scale"]


def _slot_layout(slot: dict[str, Any], text: str, single_line: bool) -> dict[str, Any]:
    return estimate_text_layout(
        text=text,
        role=str(slot.get("role") or ""),
        old_paragraphs=int(slot.get("paragraph_count") or 1),
        geometry=slot.get("geometry") or {},
        text_metrics=slot.get("text_metrics") or {},
        single_line=single_line,
    )


def _collision_errors(
    slide: dict[str, Any],
    slot: dict[str, Any],
    old_layout: dict[str, Any],
    new_layout: dict[str, Any],
) -> list[dict[str, Any]]:
    old_rect = occupied_rect(slot.get("geometry") or {}, slot.get("text_metrics") or {}, old_layout)
    new_rect = occupied_rect(slot.get("geometry") or {}, slot.get("text_metrics") or {}, new_layout)
    if old_rect is None or new_rect is None:
        return []
    slot_id = str(slot.get("shape_id") or "")
    slot_z = slot.get("z_order")
    obstacles: list[dict[str, Any]] = []
    for item in slide.get("objects", []):
        if str(item.get("shape_id") or "") == slot_id:
            continue
        item_z = item.get("z_order")
        kind = item.get("kind")
        # Only objects painted above this text can visually cover it. Other
        # text is checked regardless of order because glyphs can still overlap.
        if not item.get("has_text") and (
            not isinstance(slot_z, int) or not isinstance(item_z, int) or item_z <= slot_z
        ):
            continue
        if kind == "cxnSp":
            continue
        obstacle_rect = item.get("geometry") or {}
        old_overlap = intersection_area(old_rect, obstacle_rect)
        new_overlap = intersection_area(new_rect, obstacle_rect)
        growth = new_overlap - old_overlap
        new_area = max(float(new_rect["width"]) * float(new_rect["height"]), 1.0)
        if growth <= max(16.0, old_overlap * 0.25) or new_overlap / new_area < 0.03:
            continue
        obstacles.append(
            {
                "shape_id": item.get("shape_id"),
                "shape_name": item.get("shape_name"),
                "kind": kind,
                "z_order": item_z,
                "old_overlap_px2": round(old_overlap, 1),
                "new_overlap_px2": round(new_overlap, 1),
            }
        )
    return obstacles


def _fit_status(
    *,
    role: str,
    old_width: float,
    new_width: float,
    old_paragraphs: int,
    new_paragraphs: int,
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
    text: str,
    force_single_line: bool,
) -> tuple[str, str, float | None]:
    old_width = max(old_width, 1.0)
    ratio = new_width / old_width
    width = geometry.get("width")
    height = geometry.get("height")
    capacity = _geometry_capacity(
        role=role,
        old_paragraphs=old_paragraphs,
        geometry=geometry,
        text_metrics=text_metrics,
    )
    capacity_width = capacity[0] * capacity[1] if capacity is not None else None
    estimated_scale = _estimated_scale(
        text=text,
        role=role,
        old_paragraphs=old_paragraphs,
        geometry=geometry,
        text_metrics=text_metrics,
        force_single_line=force_single_line,
    )
    if estimated_scale is not None and estimated_scale < 0.55:
        return "WARN", "text requires aggressive auto-fit shrinking and may be difficult to read", estimated_scale
    if estimated_scale is not None and estimated_scale < 1:
        return "WARN", "text will be auto-fit inside the original text box", estimated_scale

    if role == "label_candidate" or (old_width <= 8 and old_paragraphs <= 1):
        if capacity_width is not None and new_width <= capacity_width and not (old_width <= 8):
            return "OK", "short label fits estimated text-box capacity", estimated_scale
        label_limit = old_width
        if isinstance(width, int) and width >= 220:
            label_limit = max(label_limit, old_width * 1.25)
        if new_width > label_limit:
            return "WARN", "short label exceeds original visual width; rewrite shorter", estimated_scale
        return "OK", "short label fits original visual width", estimated_scale

    if role == "title_candidate" and old_paragraphs <= 1:
        if capacity_width is not None and new_width <= capacity_width:
            return "OK", "title fits estimated text-box capacity", estimated_scale
        limit = 1.15 if old_width <= 12 else 1.35
        if ratio > limit:
            return "WARN", "title is too long for the original slot; rewrite first", estimated_scale
        return "OK", "title stays near original capacity", estimated_scale

    paragraph_limit = max(old_paragraphs + 2, old_paragraphs * 2, 2)
    if new_paragraphs > paragraph_limit:
        return "WARN", "body paragraph count changed too much; auto-fit may reduce readability", estimated_scale

    if isinstance(width, int) and isinstance(height, int) and width * height < 30000 and ratio > 2.0:
        return "WARN", "small text box with much longer text; auto-fit may reduce readability", estimated_scale

    if capacity_width is not None and new_width > capacity_width:
        return "WARN", "text exceeds estimated text-box capacity and will be auto-fit", estimated_scale

    # Body text reflows, so a moderate amount of extra length is fine; only flag
    # gross overflow. Labels / titles keep their tighter guards above.
    body_limit = 3.0 if role == "body_candidate" else 2.2
    if ratio > body_limit:
        return "WARN", "text is much longer than source slot; auto-fit may reduce readability", estimated_scale
    return "OK", "within estimated slot capacity", estimated_scale


def _capacity_for_report(
    *,
    role: str,
    old_width: float,
    old_paragraphs: int,
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
) -> float | None:
    capacity = _geometry_capacity(
        role=role,
        old_paragraphs=old_paragraphs,
        geometry=geometry,
        text_metrics=text_metrics,
    )
    if capacity is None:
        return None
    units_per_line, max_lines = capacity
    return _display_width(max(units_per_line * max_lines, old_width))


def check_plan(library: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    """Compare fill replacements against source slot capacity."""
    lookup = _slot_lookup(library)
    slides_by_index = _slide_lookup(library)
    table_lookup = _table_lookup(library)
    chart_lookup = _chart_lookup(library)
    results: list[dict[str, Any]] = []
    summary = {"ok": 0, "warn": 0, "error": 0}

    for slide_index, slide in enumerate(plan.get("slides", []), start=1):
        source_slide = int(slide.get("source_slide", 0))
        replacements = slide.get("replacements", [])
        if not isinstance(replacements, list):
            results.append(
                {
                    "status": "ERROR",
                    "plan_slide": slide_index,
                    "source_slide": source_slide,
                    "message": "replacements must be a list",
                }
            )
            summary["error"] += 1
            continue

        for replacement in replacements:
            selectors = _replacement_selectors(replacement)
            slot = next((lookup.get((source_slide, selector)) for selector in selectors), None)
            text = _replacement_text(replacement)
            if slot is None:
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "replacement target not found in slide library",
                    }
                )
                summary["error"] += 1
                continue

            old_text = str(slot.get("text") or "")
            role = str(slot.get("role") or "")
            force_single_line = bool(slot.get("single_line")) and not bool(
                replacement.get("preserve_line_breaks", False)
            )
            if force_single_line:
                text = _collapse_title_lines(text)
            old_width = _visual_width(old_text)
            new_width = _visual_width(text)
            old_paragraphs = int(slot.get("paragraph_count") or 1)
            new_paragraphs = max(len([line for line in text.splitlines() if line.strip()]), 1)
            status, message, estimated_scale = _fit_status(
                role=role,
                old_width=old_width,
                new_width=new_width,
                old_paragraphs=old_paragraphs,
                new_paragraphs=new_paragraphs,
                geometry=slot.get("geometry") or {},
                text_metrics=slot.get("text_metrics") or {},
                text=text,
                force_single_line=force_single_line,
            )
            capacity_width = _capacity_for_report(
                role=role,
                old_width=old_width,
                old_paragraphs=old_paragraphs,
                geometry=slot.get("geometry") or {},
                text_metrics=slot.get("text_metrics") or {},
            )
            old_layout = _slot_layout(slot, old_text, bool(slot.get("single_line")))
            new_layout = _slot_layout(slot, text, force_single_line)
            collisions = _collision_errors(
                slides_by_index.get(source_slide, {}),
                slot,
                old_layout,
                new_layout,
            )
            if collisions:
                status = "ERROR"
                message = "replacement creates new overlap with another slide object"
            summary[status.lower()] += 1
            results.append(
                {
                    "status": status,
                    "plan_slide": slide_index,
                    "source_slide": source_slide,
                    "slot_id": slot.get("slot_id"),
                    "role": slot.get("role"),
                    "old_len": _display_width(old_width),
                    "new_len": _display_width(new_width),
                    "old_visual_width": _display_width(old_width),
                    "new_visual_width": _display_width(new_width),
                    "capacity_visual_width": capacity_width,
                    "estimated_font_scale_percent": (
                        round(estimated_scale * 100, 1) if estimated_scale is not None else None
                    ),
                    "final_font_size_px": (
                        round(float(new_layout["font_size_px"]), 2)
                        if new_layout.get("font_size_px") is not None
                        else None
                    ),
                    "estimated_line_count": new_layout.get("line_count"),
                    "single_line": force_single_line,
                    "collisions": collisions,
                    "ratio": round(new_width / max(old_width, 1.0), 2),
                    "old_paragraphs": old_paragraphs,
                    "new_paragraphs": new_paragraphs,
                    "message": message,
                    "old_text": old_text,
                    "new_text": text,
                }
            )
        table_edits = slide.get("table_edits", [])
        if not isinstance(table_edits, list):
            results.append(
                {
                    "status": "ERROR",
                    "plan_slide": slide_index,
                    "source_slide": source_slide,
                    "message": "table_edits must be a list",
                }
            )
            summary["error"] += 1
            continue
        for table_edit in table_edits:
            selectors = _table_selectors(table_edit)
            table = next((table_lookup.get((source_slide, selector)) for selector in selectors), None)
            if table is None:
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "table target not found in slide library",
                    }
                )
                summary["error"] += 1
                continue
            cells = table_edit.get("cells", [])
            if not isinstance(cells, list):
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "table edit cells must be a list",
                    }
                )
                summary["error"] += 1
                continue
            row_count = int(table.get("row_count") or 0)
            column_count = int(table.get("column_count") or 0)
            for cell in cells:
                row = int(cell.get("row", -1))
                col = int(cell.get("col", -1))
                if row < 0 or col < 0 or row >= row_count or col >= column_count:
                    results.append(
                        {
                            "status": "ERROR",
                            "plan_slide": slide_index,
                            "source_slide": source_slide,
                            "selector": selectors[0] if selectors else "",
                            "message": f"table cell out of bounds: row={row} col={col}",
                        }
                    )
                    summary["error"] += 1
                    continue
                cell_slot = _table_cell(table, row, col) or {}
                cell_text = str(cell.get("text", ""))
                cell_layout = estimate_text_layout(
                    text=cell_text,
                    role="body_candidate",
                    old_paragraphs=int(cell_slot.get("paragraph_count") or 1),
                    geometry=cell_slot.get("geometry") or {},
                    text_metrics=cell_slot.get("text_metrics") or {},
                    single_line=False,
                )
                scale = cell_layout.get("scale")
                status = "WARN" if isinstance(scale, (int, float)) and scale < 0.55 else "OK"
                summary[status.lower()] += 1
                results.append(
                    {
                        "status": status,
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "table_id": table.get("table_id"),
                        "row": row,
                        "col": col,
                        "estimated_font_scale_percent": (
                            round(float(scale) * 100, 1) if isinstance(scale, (int, float)) else None
                        ),
                        "final_font_size_px": (
                            round(float(cell_layout["font_size_px"]), 2)
                            if cell_layout.get("font_size_px") is not None
                            else None
                        ),
                        "estimated_line_count": cell_layout.get("line_count"),
                        "message": (
                            "table cell requires aggressive auto-fit shrinking"
                            if status == "WARN"
                            else "table cell target and capacity are valid"
                        ),
                    }
                )
        chart_edits = slide.get("chart_edits", [])
        if not isinstance(chart_edits, list):
            results.append(
                {
                    "status": "ERROR",
                    "plan_slide": slide_index,
                    "source_slide": source_slide,
                    "message": "chart_edits must be a list",
                }
            )
            summary["error"] += 1
            continue
        for chart_edit in chart_edits:
            selectors = _chart_selectors(chart_edit)
            chart = next((chart_lookup.get((source_slide, selector)) for selector in selectors), None)
            if chart is None:
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "chart target not found in slide library",
                    }
                )
                summary["error"] += 1
                continue
            categories = chart_edit.get("categories", [])
            series = chart_edit.get("series", [])
            if not isinstance(categories, list) or not isinstance(series, list) or not series:
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "chart edit requires categories list and non-empty series list",
                    }
                )
                summary["error"] += 1
                continue
            bad_series = [
                item
                for item in series
                if not isinstance(item, dict)
                or not isinstance(item.get("values", []), list)
                or len(item.get("values", [])) != len(categories)
            ]
            if bad_series:
                results.append(
                    {
                        "status": "ERROR",
                        "plan_slide": slide_index,
                        "source_slide": source_slide,
                        "selector": selectors[0] if selectors else "",
                        "message": "each chart series needs values matching categories length",
                    }
                )
                summary["error"] += 1
                continue
            summary["ok"] += 1
            results.append(
                {
                    "status": "OK",
                    "plan_slide": slide_index,
                    "source_slide": source_slide,
                    "chart_id": chart.get("chart_id"),
                    "category_count": len(categories),
                    "series_count": len(series),
                    "message": "chart edit target and data shape are valid",
                }
            )
    return {"schema": "template_fill_pptx_check.v1", "summary": summary, "results": results}


def print_check_report(report: dict[str, Any]) -> None:
    summary = report["summary"]
    print(f"check-plan: ok={summary['ok']} warn={summary['warn']} error={summary['error']}")
    for item in report["results"]:
        if item["status"] == "OK":
            continue
        if "ratio" in item:
            line = (
                "{status} P{plan_slide:02d} source={source_slide} {slot_id} "
                "{role} old={old_len} new={new_len} ratio={ratio}: {message}".format(**item)
            )
        else:
            target = item.get("slot_id") or item.get("selector") or ""
            line = (
                f"{item['status']} P{item['plan_slide']:02d} "
                f"source={item['source_slide']} {target}: {item['message']}".strip()
            )
        print(line)
