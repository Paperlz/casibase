"""Deterministic text measurement shared by analysis, checking, and writing."""

from __future__ import annotations

import math
import unicodedata
from typing import Any


def visual_width(text: str) -> float:
    width = 0.0
    for char in "".join(text.split()):
        east_asian_width = unicodedata.east_asian_width(char)
        if east_asian_width in {"F", "W"}:
            width += 2.0
        elif east_asian_width == "A":
            width += 1.5
        else:
            width += 1.0
    return width


def fallback_font_size_px(role: str, geometry: dict[str, Any], old_paragraphs: int) -> float:
    height = geometry.get("height")
    if isinstance(height, int) and old_paragraphs > 0:
        inferred = height / max(old_paragraphs, 1) / 1.25
        if 8 <= inferred <= 56:
            return inferred
    if role == "title_candidate":
        return 28.0
    if role == "body_candidate":
        return 16.0
    return 14.0


def _usable_box(
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
) -> tuple[float, float] | None:
    width = geometry.get("width")
    height = geometry.get("height")
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        return None
    margins = text_metrics.get("margins_px") or {}
    horizontal_padding = float(margins.get("left", 12)) + float(margins.get("right", 12))
    vertical_padding = float(margins.get("top", 4)) + float(margins.get("bottom", 4))
    return max(width - horizontal_padding, 1.0), max(height - vertical_padding, 1.0)


def _line_height(font_size_px: float, text_metrics: dict[str, Any]) -> float:
    absolute = text_metrics.get("line_spacing_px")
    if isinstance(absolute, (int, float)) and absolute > 0:
        # Absolute line spacing scales with the font just like the source style.
        base = text_metrics.get("font_size_px")
        if isinstance(base, (int, float)) and base > 0:
            return max(float(absolute) * font_size_px / float(base), 1.0)
        return max(float(absolute), 1.0)
    spacing = text_metrics.get("line_spacing")
    if not isinstance(spacing, (int, float)) or spacing <= 0:
        spacing = 1.25
    return max(font_size_px * float(spacing), 1.0)


def _units_per_line(usable_width: float, font_size_px: float, role: str) -> float:
    units = usable_width / max(font_size_px * 0.52, 1.0)
    if role == "label_candidate":
        units *= 0.82
    elif role == "title_candidate":
        units *= 0.9
    return max(units, 1.0)


def _required_lines(text: str, units_per_line: float, single_line: bool) -> int:
    lines = [line for line in text.splitlines() if line.strip()] or [""]
    if single_line:
        return 1
    return sum(max(1, math.ceil(visual_width(line) / units_per_line)) for line in lines)


def estimate_text_layout(
    *,
    text: str,
    role: str,
    old_paragraphs: int,
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
    single_line: bool,
) -> dict[str, float | int | None]:
    box = _usable_box(geometry, text_metrics)
    if box is None:
        return {
            "scale": None,
            "font_size_px": None,
            "line_count": max(len(text.splitlines()), 1),
            "occupied_width": None,
            "occupied_height": None,
        }
    usable_width, usable_height = box
    base_font = text_metrics.get("font_size_px")
    if not isinstance(base_font, (int, float)) or base_font <= 0:
        base_font = fallback_font_size_px(role, geometry, old_paragraphs)
    base_font = float(base_font)

    def fits(scale: float) -> tuple[bool, int, float, float]:
        font = max(base_font * scale, 0.01)
        units = _units_per_line(usable_width, font, role)
        line_count = _required_lines(text, units, single_line)
        if single_line:
            occupied_width = visual_width(text) * font * 0.52
        else:
            occupied_width = min(
                usable_width,
                max((min(visual_width(line), units) for line in text.splitlines() or [""]), default=0.0)
                * font
                * 0.52,
            )
        occupied_height = line_count * _line_height(font, text_metrics)
        return occupied_width <= usable_width + 0.5 and occupied_height <= usable_height + 0.5, line_count, occupied_width, occupied_height

    ok, lines, occupied_width, occupied_height = fits(1.0)
    if ok:
        scale = 1.0
    else:
        low, high = 0.001, 1.0
        for _ in range(24):
            middle = (low + high) / 2
            if fits(middle)[0]:
                low = middle
            else:
                high = middle
        scale = low
        _ok, lines, occupied_width, occupied_height = fits(scale)
    return {
        "scale": scale,
        "font_size_px": base_font * scale,
        "line_count": lines,
        "occupied_width": min(occupied_width, usable_width),
        "occupied_height": min(occupied_height, usable_height),
    }


def occupied_rect(
    geometry: dict[str, Any],
    text_metrics: dict[str, Any],
    layout: dict[str, float | int | None],
) -> dict[str, float] | None:
    x = geometry.get("x")
    y = geometry.get("y")
    width = layout.get("occupied_width")
    height = layout.get("occupied_height")
    if not all(isinstance(value, (int, float)) for value in (x, y, width, height)):
        return None
    margins = text_metrics.get("margins_px") or {}
    left = float(margins.get("left", 12))
    right = float(margins.get("right", 12))
    top = float(margins.get("top", 4))
    bottom = float(margins.get("bottom", 4))
    available_width = max(float(geometry.get("width", width)) - left - right, 0.0)
    available_height = max(float(geometry.get("height", height)) - top - bottom, 0.0)
    alignment = text_metrics.get("alignment")
    if alignment in {"ctr", "center"}:
        left += max((available_width - float(width)) / 2, 0.0)
    elif alignment in {"r", "right"}:
        left += max(available_width - float(width), 0.0)
    anchor = text_metrics.get("anchor")
    if anchor in {"ctr", "mid"}:
        top += max((available_height - float(height)) / 2, 0.0)
    elif anchor in {"b", "bottom"}:
        top += max(available_height - float(height), 0.0)
    return {
        "x": float(x) + left,
        "y": float(y) + top,
        "width": float(width),
        "height": float(height),
    }


def intersection_area(first: dict[str, Any], second: dict[str, Any]) -> float:
    required = ("x", "y", "width", "height")
    if not all(isinstance(first.get(key), (int, float)) and isinstance(second.get(key), (int, float)) for key in required):
        return 0.0
    left = max(float(first["x"]), float(second["x"]))
    top = max(float(first["y"]), float(second["y"]))
    right = min(float(first["x"]) + float(first["width"]), float(second["x"]) + float(second["width"]))
    bottom = min(float(first["y"]) + float(first["height"]), float(second["y"]) + float(second["height"]))
    return max(right - left, 0.0) * max(bottom - top, 0.0)
