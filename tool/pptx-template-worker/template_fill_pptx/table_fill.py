"""apply: edit native PowerPoint table cell text on cloned slides.

Edits existing cells only — row / column structure is left untouched.
"""

from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

from .ooxml import NS, _shape_identity, _table_containers
from .selectors import _table_cell_text, _table_selectors
from .text_fill import _set_container_text


def _table_key_maps(slide_root: ET.Element, source_slide: int) -> dict[str, ET.Element]:
    maps: dict[str, ET.Element] = {}
    for order, container in enumerate(_table_containers(slide_root), start=1):
        shape_id, shape_name = _shape_identity(container, order)
        maps[f"table_id:s{source_slide:02d}_tbl{shape_id}"] = container
        maps[f"shape_id:{shape_id}"] = container
        if shape_name:
            maps[f"shape_name:{shape_name}"] = container
    return maps


def _apply_table_edits_to_slide(
    slide_root: ET.Element,
    *,
    source_slide: int,
    table_edits: list[dict[str, Any]],
    tables: list[dict[str, Any]] | None = None,
) -> None:
    maps = _table_key_maps(slide_root, source_slide)
    table_metadata: dict[str, dict[str, Any]] = {}
    for table in tables or []:
        for field in ("table_id", "shape_id", "shape_name"):
            if table.get(field):
                table_metadata[f"{field}:{table[field]}"] = table
    errors: list[str] = []
    for table_edit in table_edits:
        selectors = _table_selectors(table_edit)
        table_frame = next((maps[key] for key in selectors if key in maps), None)
        if table_frame is None:
            if table_edit.get("optional"):
                continue
            errors.append(", ".join(selectors) or "<missing selector>")
            continue
        rows = table_frame.findall(".//a:tbl/a:tr", NS)
        metadata = next((table_metadata[key] for key in selectors if key in table_metadata), {})
        cells = table_edit.get("cells", [])
        if not isinstance(cells, list):
            raise RuntimeError(f"Slide {source_slide} table edit cells must be a list")
        for cell_edit in cells:
            row_index = int(cell_edit.get("row", -1))
            col_index = int(cell_edit.get("col", -1))
            if row_index < 0 or row_index >= len(rows):
                errors.append(f"{selectors[0] if selectors else '<table>'} row={row_index}")
                continue
            row_cells = rows[row_index].findall("a:tc", NS)
            if col_index < 0 or col_index >= len(row_cells):
                errors.append(f"{selectors[0] if selectors else '<table>'} row={row_index} col={col_index}")
                continue
            cell_slot = next(
                (
                    cell
                    for row_item in metadata.get("rows", [])
                    if int(row_item.get("row", -1)) == row_index
                    for cell in row_item.get("cells", [])
                    if int(cell.get("col", -1)) == col_index
                ),
                None,
            )
            if cell_slot:
                cell_slot = {**cell_slot, "role": "body_candidate", "single_line": False}
            _set_container_text(
                row_cells[col_index],
                _table_cell_text(cell_edit),
                slot=cell_slot,
            )
    if errors:
        raise RuntimeError(f"Invalid table edit target(s) on slide {source_slide}: {'; '.join(errors)}")
