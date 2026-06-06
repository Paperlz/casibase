#!/usr/bin/env python3
"""JSON worker for Casibase native PPTX template analysis and filling."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from template_fill_pptx import analyze_pptx, apply_plan, check_plan


def _read_spec() -> dict[str, Any]:
    if len(sys.argv) != 2:
        raise RuntimeError("usage: worker.py <spec.json>")
    with Path(sys.argv[1]).open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise RuntimeError("worker spec must be a JSON object")
    return value


def _require_pptx(path_value: Any) -> Path:
    path = Path(str(path_value or "")).expanduser().resolve()
    if path.suffix.lower() != ".pptx":
        raise RuntimeError("template must be a .pptx file")
    if not path.is_file():
        raise RuntimeError(f"template file does not exist: {path}")
    return path


def _analyze(spec: dict[str, Any]) -> dict[str, Any]:
    library = analyze_pptx(_require_pptx(spec.get("template")))
    return {"ok": True, "library": library}


def _fill(spec: dict[str, Any]) -> dict[str, Any]:
    template = _require_pptx(spec.get("template"))
    output = Path(str(spec.get("output") or "")).expanduser().resolve()
    if output.suffix.lower() != ".pptx":
        raise RuntimeError("output must use the .pptx extension")
    plan = spec.get("plan")
    if not isinstance(plan, dict):
        raise RuntimeError("plan must be a JSON object")
    if plan.get("schema") != "template_fill_pptx_plan.v1":
        raise RuntimeError("plan schema must be template_fill_pptx_plan.v1")

    # Never trust or use a caller-provided source_pptx path.
    plan = dict(plan)
    plan["source_pptx"] = str(template)
    library = analyze_pptx(template)
    report = check_plan(library, plan)
    if report["summary"]["error"]:
        return {
            "ok": False,
            "error": "fill plan validation failed",
            "check_report": report,
        }

    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{output.stem}-", suffix=".pptx", dir=output.parent
    )
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        apply_plan(
            template,
            plan,
            temporary,
            transition=spec.get("transition", "keep"),
            transition_duration=float(spec.get("transition_duration", 0.5)),
        )
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)

    return {
        "ok": True,
        "path": str(output),
        "slide_count": len(plan.get("slides", [])),
        "check_report": report,
    }


def main() -> int:
    if sys.version_info < (3, 10):
        raise RuntimeError("Python 3.10 or newer is required")
    spec = _read_spec()
    action = spec.get("action")
    if action == "analyze":
        result = _analyze(spec)
    elif action == "fill":
        result = _fill(spec)
    else:
        raise RuntimeError(f"unsupported action: {action}")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
