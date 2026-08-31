import json
import posixpath
import zipfile
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

BOOK_PATH = Path(r"C:\Users\rguimaraes\Downloads\#INDICADORES# 2026.xlsx")
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
}


def resolve(base_file, target):
    return posixpath.normpath(posixpath.join(posixpath.dirname(base_file), target))


def rels_path(part):
    p = PurePosixPath(part)
    return str(p.parent / "_rels" / f"{p.name}.rels")


with zipfile.ZipFile(BOOK_PATH) as zf:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    workbook_rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: resolve("xl/workbook.xml", rel.attrib["Target"]) for rel in workbook_rels}
    sheets = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rid = sheet.attrib[f"{{{NS['rel']}}}id"]
        sheet_part = rel_map[rid]
        sheet_xml = ET.fromstring(zf.read(sheet_part))
        drawings = []
        sheet_rels_file = rels_path(sheet_part)
        sheet_rel_map = {}
        if sheet_rels_file in zf.namelist():
            rels = ET.fromstring(zf.read(sheet_rels_file))
            sheet_rel_map = {rel.attrib["Id"]: resolve(sheet_part, rel.attrib["Target"]) for rel in rels}
        for drawing_ref in sheet_xml.findall("main:drawing", NS):
            drawing_rid = drawing_ref.attrib[f"{{{NS['rel']}}}id"]
            drawing_part = sheet_rel_map.get(drawing_rid)
            if not drawing_part or drawing_part not in zf.namelist():
                continue
            drawing_xml = ET.fromstring(zf.read(drawing_part))
            drawing_rels_file = rels_path(drawing_part)
            drawing_rel_map = {}
            if drawing_rels_file in zf.namelist():
                rels = ET.fromstring(zf.read(drawing_rels_file))
                drawing_rel_map = {rel.attrib["Id"]: resolve(drawing_part, rel.attrib["Target"]) for rel in rels}
            objects = []
            for anchor in list(drawing_xml):
                text = " ".join(t.text.strip() for t in anchor.findall(".//a:t", NS) if t.text and t.text.strip())
                name_node = anchor.find(".//xdr:cNvPr", NS)
                chart_node = anchor.find(".//c:chart", NS)
                chart_info = None
                if chart_node is not None:
                    chart_rid = chart_node.attrib.get(f"{{{NS['rel']}}}id")
                    chart_part = drawing_rel_map.get(chart_rid)
                    if chart_part and chart_part in zf.namelist():
                        chart_xml = ET.fromstring(zf.read(chart_part))
                        title_text = " ".join(t.text.strip() for t in chart_xml.findall(".//a:t", NS) if t.text and t.text.strip())
                        formulas = [f.text for f in chart_xml.findall(".//c:f", NS) if f.text]
                        chart_info = {"part": chart_part, "title_text": title_text, "formulas": formulas}
                objects.append({
                    "name": name_node.attrib.get("name") if name_node is not None else None,
                    "text": text or None,
                    "chart": chart_info,
                })
            drawings.append({"part": drawing_part, "objects": objects})
        sheets.append({"name": sheet.attrib["name"], "state": sheet.attrib.get("state", "visible"), "part": sheet_part, "drawings": drawings})

Path("ooxml-report.json").write_text(json.dumps({"sheets": sheets}, ensure_ascii=False, indent=2), encoding="utf-8")
for sheet in sheets:
    texts = [obj["text"] for drawing in sheet["drawings"] for obj in drawing["objects"] if obj["text"]]
    charts = [obj["chart"] for drawing in sheet["drawings"] for obj in drawing["objects"] if obj["chart"]]
    print(json.dumps({"name": sheet["name"], "shape_texts": texts, "charts": charts}, ensure_ascii=False))
