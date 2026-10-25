"""Independent check of the housing pressure mart against the banked MHCLG files.

Shares no code with scripts/transform/transform-housing-pressure.mjs: it reads each ODS
file's content.xml with the standard library, expands repeated rows and columns itself,
and for every value in the mart checks (1) the cell's raw value or suppression marker,
(2) that the same row carries the area's code, and (3) that the column header is the one
the mart claims. Any difference exits non-zero.

    uv run --no-project python scripts/audit/verify-housing-pressure.py
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/mhclg_homelessness"
MART = json.loads((ROOT / "data/marts/mhclg_homelessness/housing-pressure.json").read_text())
NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
T = "{%s}" % NS["table"]
O = "{%s}" % NS["office"]
MARKERS = {"[c]": "suppressed", "[x]": "not_submitted", "[z]": "not_applicable", "[n]": "not_applicable", "M": "not_submitted"}

# sheet -> (header row index, code column index, expected header text per column letter)
HEADERS = {
    "TA1": (5, 0, {"C": "Households in TA Total [note 34]", "F": "Households in TA with children Total", "G": "Children in TA Total"}),
    "A2P": (5, 0, {"C": "Owed a prevention duty Total", "AO": "Required to leave accommodation provided by Home Office as asylum support"}),
    "A2R": (5, 0, {"C": "Owed a relief duty Total", "AO": "Required to leave accommodation provided by Home Office as asylum support"}),
    "Table_1_Total": (4, 0, {"T": "2025"}),
    "RO4_LA_Data_202526": (6, 1, {"DO": "TOTAL HOMELESSNESS - Net Current Expenditure (C7 = C3 - C6)"}),
}
FILES = {
    "TA1": "Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods",
    "A2P": "Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods",
    "A2R": "Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods",
    "Table_1_Total": "Rough_sleeping_snapshot_in_England__autumn_2025.ods",
    "RO4_LA_Data_202526": "RO4_LA_Data_2025-26_data_by_LA.ods",
}


def cell_value(cell):
    """(number or None, text) for one table:table-cell."""
    if cell.get(O + "value-type") in ("float", "currency", "percentage"):
        return float(cell.get(O + "value")), None
    text = " ".join("".join(p.itertext()) for p in cell.findall("text:p", NS))
    return None, text


def read_sheet(path, name):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("content.xml"))
    sheet = next(t for t in root.iter(T + "table") if t.get(T + "name") == name)
    rows = []
    for row in sheet.iter(T + "table-row"):
        cells = []
        for cell in row:
            if cell.tag not in (T + "table-cell", T + "covered-table-cell"):
                continue
            repeat = int(cell.get(T + "number-columns-repeated", "1"))
            cells.extend([cell_value(cell)] * min(repeat, 400))
        rows.extend([cells] * min(int(row.get(T + "number-rows-repeated", "1")), 2000))
    return rows


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def parse_ref(ref):
    sheet, a1 = ref.split("!")
    letters, digits = re.match(r"([A-Z]+)(\d+)", a1).groups()
    return sheet, int(digits) - 1, col_index(letters), letters


sheets = {name: read_sheet(RAW / file, name) for name, file in FILES.items()}
norm = lambda s: re.sub(r"\s+", " ", s or "").strip()
errors, checked = [], 0


def check(code, label, fig, scale):
    global checked
    sheet, r, c, letters = parse_ref(fig["cell"])
    header_row, code_col, headers = HEADERS[sheet]
    rows = sheets[sheet]
    expected_header = headers.get(letters)
    got_header = norm(rows[header_row][c][1] if rows[header_row][c][0] is None else str(int(rows[header_row][c][0])))
    if expected_header is None or got_header != expected_header:
        errors.append(f"{code} {label}: header at {fig['cell']} is {got_header!r}")
    row_code_num, row_code = rows[r][code_col]
    row_code = norm(row_code)
    region_code = norm(rows[r][2][1]) if sheet == "Table_1_Total" else None
    if code != row_code and not (code == "E92000001" and (region_code == code or norm(rows[r][2][1]) == "ENGLAND")):
        errors.append(f"{code} {label}: row {r + 1} of {sheet} is {row_code!r}")
    num, text = rows[r][c]
    if num is not None:
        want = num if scale == 1 else round(num * scale)
        if fig["status"] != "published" or fig["value"] is None or abs(fig["value"] - want) > 1e-6:
            errors.append(f"{code} {label}: {fig['cell']} is {num}, mart has {fig['value']} ({fig['status']})")
    else:
        status = MARKERS.get(norm(text))
        if status is None or fig["value"] is not None or fig["status"] != status:
            errors.append(f"{code} {label}: {fig['cell']} is {text!r}, mart has {fig['value']} ({fig['status']})")
    checked += 1


def check_area(code, area):
    for group in ("temporaryAccommodation", "duties"):
        for key, fig in area[group].items():
            check(code, f"{group}.{key}", fig, 1)
    check(code, "roughSleeping", area["roughSleeping"], 1)
    check(code, "homelessnessNetSpend", area["homelessnessNetSpend"], 1000)


for code, area in MART["areas"].items():
    check_area(code, area)
check_area("E92000001", MART["england"])

print(f"verify-housing-pressure: {checked} cells checked across {len(MART['areas'])} areas and England")
if errors:
    print(f"{len(errors)} mismatches:")
    print("\n".join(errors[:50]))
    sys.exit(1)
print("All cells match the source files.")
