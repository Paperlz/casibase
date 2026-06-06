import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


WORKER_ROOT = Path(__file__).resolve().parents[1]
WORKER = WORKER_ROOT / "worker.py"
sys.path.insert(0, str(WORKER_ROOT))

from template_fill_pptx.chart_fill import (  # noqa: E402
    _apply_chart_edit_to_chart_xml,
    _rewrite_chart_workbook,
)

P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"


def _write_fixture(path: Path) -> None:
    parts = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>""",
        "ppt/presentation.xml": f"""<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="{P_NS}" xmlns:r="{R_NS}">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>""",
        "ppt/_rels/presentation.xml.rels": """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>""",
        "ppt/slides/slide1.xml": f"""<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="{P_NS}" xmlns:a="{A_NS}" xmlns:r="{R_NS}">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="9144000" cy="914400"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="3200"/><a:t>Template title</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="3" name="Data Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="914400" y="1828800"/><a:ext cx="7315200" cy="1828800"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="3657600"/><a:gridCol w="3657600"/></a:tblGrid>
          <a:tr h="914400">
            <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  <p:transition><p:fade/></p:transition>
  <p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite"/></p:par></p:tnLst></p:timing>
</p:sld>""",
        "ppt/slides/_rels/slide1.xml.rels": """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>""",
        "ppt/slideLayouts/slideLayout1.xml": f"""<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:p="{P_NS}" xmlns:a="{A_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>""",
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>""",
        "ppt/slideMasters/slideMaster1.xml": f"""<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:p="{P_NS}" xmlns:a="{A_NS}" xmlns:r="{R_NS}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>""",
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>""",
        "ppt/theme/theme1.xml": f"""<?xml version="1.0" encoding="UTF-8"?>
<a:theme xmlns:a="{A_NS}" name="Fixture"><a:themeElements><a:clrScheme name="Fixture"/></a:themeElements></a:theme>""",
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)


def _run_worker(spec: dict) -> tuple[int, dict]:
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
        json.dump(spec, handle)
        spec_path = Path(handle.name)
    try:
        process = subprocess.run(
            [sys.executable, str(WORKER), str(spec_path)],
            cwd=WORKER_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        return process.returncode, json.loads(process.stdout)
    finally:
        spec_path.unlink(missing_ok=True)


def _xlsx_fixture() -> bytes:
    from io import BytesIO

    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "xl/workbook.xml",
            f"""<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{R_NS}">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>""",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>""",
        )
    return output.getvalue()


class WorkerTest(unittest.TestCase):
    def test_analyze_and_fill_repeated_slide(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            template = Path(directory) / "template.pptx"
            output = Path(directory) / "output.pptx"
            _write_fixture(template)

            code, analyzed = _run_worker({"action": "analyze", "template": str(template)})
            self.assertEqual(code, 0, analyzed)
            library = analyzed["library"]
            self.assertEqual(library["schema"], "template_fill_pptx_library.v1")
            self.assertEqual(library["slide_count"], 1)
            self.assertEqual(library["canvas_px"], {"width": 1280, "height": 720})
            self.assertEqual(library["slides"][0]["slots"][0]["slot_id"], "s01_sh2")
            self.assertEqual(library["slides"][0]["tables"][0]["table_id"], "s01_tbl3")

            plan = {
                "schema": "template_fill_pptx_plan.v1",
                "source_pptx": "/must/not/be/used.pptx",
                "slides": [
                    {
                        "source_slide": 1,
                        "replacements": [{"slot_id": "s01_sh2", "text": "First"}],
                        "table_edits": [{"table_id": "s01_tbl3", "cells": [{"row": 0, "col": 1, "text": "Updated"}]}],
                        "notes": "**Speaker** note",
                    },
                    {
                        "source_slide": 1,
                        "replacements": [{"slot_id": "s01_sh2", "text": "Second"}],
                    },
                ],
            }
            code, filled = _run_worker(
                {"action": "fill", "template": str(template), "output": str(output), "plan": plan}
            )
            self.assertEqual(code, 0, filled)
            self.assertEqual(filled["slide_count"], 2)
            self.assertEqual(filled["check_report"]["summary"]["error"], 0)

            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
                presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
                slide_ids = presentation.findall(f".//{{{P_NS}}}sldId")
                self.assertEqual(len(slide_ids), 2)
                slides = sorted(name for name in names if name.startswith("ppt/slides/slide") and name.endswith(".xml"))
                slide_xml = [archive.read(name).decode("utf-8") for name in slides]
                self.assertTrue(any("First" in content and "Updated" in content for content in slide_xml))
                self.assertTrue(any("Second" in content for content in slide_xml))
                self.assertTrue(all("<p:timing>" in content and "<p:fade" in content for content in slide_xml))
                self.assertIn("ppt/slideLayouts/slideLayout1.xml", names)
                self.assertIn("ppt/slideMasters/slideMaster1.xml", names)
                self.assertTrue(any(name.startswith("ppt/notesSlides/notesSlide") for name in names))

    def test_invalid_target_stops_before_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            template = Path(directory) / "template.pptx"
            output = Path(directory) / "output.pptx"
            _write_fixture(template)
            plan = {
                "schema": "template_fill_pptx_plan.v1",
                "slides": [{"source_slide": 1, "replacements": [{"slot_id": "missing", "text": "No"}]}],
            }
            code, result = _run_worker(
                {"action": "fill", "template": str(template), "output": str(output), "plan": plan}
            )
            self.assertNotEqual(code, 0)
            self.assertEqual(result["check_report"]["summary"]["error"], 1)
            self.assertFalse(output.exists())

    def test_chart_cache_and_embedded_workbook_are_updated(self) -> None:
        chart = ET.fromstring(
            f"""<c:chartSpace xmlns:c="{C_NS}"><c:chart><c:plotArea><c:barChart><c:ser>
<c:idx val="0"/><c:order val="0"/><c:tx><c:v>Old</c:v></c:tx>
<c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Old A</c:v></c:pt></c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache></c:numRef></c:val>
</c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>"""
        )
        edit = {
            "categories": ["North", "South"],
            "series": [
                {"name": "Revenue", "values": [10, 20]},
                {"name": "Cost", "values": [4, 8]},
            ],
        }
        _apply_chart_edit_to_chart_xml(chart, edit)
        chart_text = ET.tostring(chart, encoding="unicode")
        for value in ("North", "South", "Revenue", "Cost", ">10<", ">20<", ">4<", ">8<"):
            self.assertIn(value, chart_text)
        self.assertEqual(len(chart.findall(f".//{{{C_NS}}}ser")), 2)

        workbook = _rewrite_chart_workbook(_xlsx_fixture(), edit)
        with zipfile.ZipFile(__import__("io").BytesIO(workbook)) as archive:
            sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
        for value in ("Category", "North", "South", "Revenue", "Cost", ">10<", ">20<", ">4<", ">8<"):
            self.assertIn(value, sheet)


if __name__ == "__main__":
    unittest.main()
