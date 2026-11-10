"""Independent check that the site's headline counts are the Home Office's, to the person.

Shares no code with scripts/transform/transform-routes.mjs or the xlsx library it uses:
it opens each fetched file as a zip with the standard library, reads the sheet XML
itself, and sums the published rows. It then compares, for the latest date in each
table:

  people on asylum support      Asy_D09, all rows        mart latestQuarter.supportedAsylum
  people in hotels              Asy_D09, "Contingency    mart latestQuarter.hotelAccommodation
                                Accommodation - Hotel"
  claims awaiting a decision    Asy_D03, "Pending        mart latestQuarter.awaitingInitialDecision
                                initial decision"
  every area's support count    Reg_02, column I         local-route-latest areas[].supportedAsylum
  every area's contingency      Reg_02, column L         local-route-latest areas[].contingencyAccommodation

and that the Reg_02 areas sum to the Asy_D09 national total, which they do in every
release checked (97,519 at 31 March 2026, 93,293 at 30 June 2026). With --dist it also
reads the built homepage, the asylum seekers explainer and every place page, and fails if
any of them does not print the table's figure.

Any difference exits 1. The refresh job runs this beside npm test, so a refresh whose
counts differ from the tables is parked on a branch and never committed or deployed.

    uv run --no-project python -I scripts/audit/verify-headline-counts.py [--dist]
"""

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/uk_routes"
MANIFEST = json.loads((ROOT / "data/raw/manifests/uk_routes.json").read_text())
DASHBOARD = json.loads((ROOT / "data/marts/uk_routes/national-route-dashboard.json").read_text())
LOCAL = json.loads((ROOT / "data/marts/uk_routes/local-route-latest.json").read_text())
RELEASES_PATH = ROOT / "data/marts/uk_routes/local-route-releases.json"

S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"
T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
TEXT_P = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"

failures = []


def check(label, table_value, site_value):
    ok = table_value == site_value
    print(f"  {'ok  ' if ok else 'DIFF'} {label}: table {table_value:,} site {site_value:,}")
    if not ok:
        failures.append(label)


def raw_file(source_id):
    entry = next(f for f in MANIFEST["files"] if f["sourceId"] == source_id)
    path = RAW / entry["fileName"]
    if not path.exists():
        sys.exit(f"{path} is missing. Run npm run fetch:routes first; this check reads the fetched files.")
    return path


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def xlsx_rows(path, sheet_name):
    """Yield each row of one sheet as a list of str or float, in column order."""
    with zipfile.ZipFile(path) as z:
        book = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = next(s.get(R + "id") for s in book.iter(S + "sheet") if s.get("name") == sheet_name)
        target = next(r.get("Target") for r in rels.iter(PR + "Relationship") if r.get("Id") == rid)
        target = target.lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(S + "si"):
                shared.append("".join(t.text or "" for t in si.iter(S + "t")))
        with z.open(target) as handle:
            for _, row in ET.iterparse(handle):
                if row.tag != S + "row":
                    continue
                cells = {}
                for c in row.iter(S + "c"):
                    kind = c.get("t")
                    v = c.find(S + "v")
                    if kind == "s":
                        value = shared[int(v.text)]
                    elif kind == "inlineStr":
                        value = "".join(t.text or "" for t in c.iter(S + "t"))
                    elif v is None:
                        value = None
                    elif kind in ("str", "e", "b"):
                        value = v.text
                    else:
                        value = float(v.text)
                    cells[col_index(c.get("r"))] = value
                row.clear()
                if cells:
                    yield [cells.get(i) for i in range(max(cells) + 1)]


def ods_rows(path, sheet_name):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("content.xml"))
    sheet = next(t for t in root.iter(T + "table") if t.get(T + "name") == sheet_name)
    for row in sheet.iter(T + "table-row"):
        cells = []
        for cell in row:
            if cell.tag not in (T + "table-cell", T + "covered-table-cell"):
                continue
            if cell.get(O + "value-type") in ("float", "percentage", "currency"):
                value = float(cell.get(O + "value"))
            else:
                value = " ".join("".join(p.itertext()) for p in cell.iter(TEXT_P)) or None
            cells.extend([value] * min(int(cell.get(T + "number-columns-repeated", "1")), 64))
        if any(v is not None for v in cells):
            for _ in range(min(int(row.get(T + "number-rows-repeated", "1")), 2)):
                yield cells


def latest_sum(rows, value_header, keep=lambda row, header: True):
    """Sum value_header over the rows dated at the latest date in the table.

    The date column is headed "Date (as at...)" in Asy_D03 and "Date (as at…)", with
    an ellipsis character, in Asy_D09, so it is found by its first word.
    """
    header = None
    date_col = None
    totals = {}
    for row in rows:
        if header is None:
            if value_header in row:
                header = {name: i for i, name in enumerate(row) if name}
                date_col = next(i for name, i in header.items() if str(name).startswith("Date"))
            continue
        date = row[date_col] if date_col < len(row) else None
        value = row[header[value_header]] if header[value_header] < len(row) else None
        if not isinstance(date, str) or not isinstance(value, float) or not keep(row, header):
            continue
        key = datetime.strptime(date.strip(), "%d %b %Y").date()
        totals[key] = totals.get(key, 0) + value
    if header is None:
        sys.exit(f"No header row with '{value_header}'.")
    latest = max(totals)
    return latest, int(totals[latest])


print(f"Home Office release: {MANIFEST['release']} (published {MANIFEST['releaseDate']})")
latest = DASHBOARD["nationalSystemDynamics"]["latestQuarter"]

support_path = raw_file("asylum_support")
d09_date, d09_total = latest_sum(xlsx_rows(support_path, "Data_Asy_D09"), "People")
_, d09_hotel = latest_sum(
    xlsx_rows(support_path, "Data_Asy_D09"), "People",
    lambda row, h: str(row[h["Accommodation Type"]]).strip() == "Contingency Accommodation - Hotel",
)
print(f"\n{support_path.name}, Data_Asy_D09, as at {d09_date:%d %B %Y}")
stock_date = datetime.strptime(latest["stockPeriodLabel"], "%d %b %Y").date()
if stock_date != d09_date:
    failures.append("support date")
    print(f"  DIFF date: table {d09_date} site {stock_date}")
check("people on asylum support", d09_total, latest["supportedAsylum"])
check("people in contingency hotels", d09_hotel, latest["hotelAccommodation"])

awaiting_path = raw_file("asylum_awaiting_decision")
d03_date, d03_pending = latest_sum(
    xlsx_rows(awaiting_path, "Data_Asy_D03"), "Claims",
    lambda row, h: str(row[h["Application stage"]]).strip() == "Pending initial decision",
)
print(f"\n{awaiting_path.name}, Data_Asy_D03, as at {d03_date:%d %B %Y}")
check("claims awaiting an initial decision", d03_pending, latest["awaitingInitialDecision"])

local_path = raw_file("local_immigration_groups")
reg = list(ods_rows(local_path, "Reg_02"))
title = reg[0][0]
as_at = datetime.strptime(re.search(r"as at (\d{1,2} \w+ \d{4})", title).group(1), "%d %B %Y").date()
print(f"\n{local_path.name}, Reg_02, as at {as_at:%d %B %Y}")
if as_at.isoformat() != LOCAL["snapshotDate"]:
    failures.append("local snapshot date")
    print(f"  DIFF date: table {as_at} site {LOCAL['snapshotDate']}")
header = reg[1]
assert header[2] == "LTLA (ONS code)" and header[8].startswith("Supported Asylum"), header[:9]
assert "Contingency" in header[11], header[11]
table_areas = {str(row[2]).strip(): row for row in reg[2:] if row and len(row) > 11 and row[2]}
site_areas = {a["areaCode"]: a for a in LOCAL["areas"]}
area_diffs = []
for code, area in site_areas.items():
    row = table_areas.get(code)
    if row is None:
        area_diffs.append(f"{code} {area['areaName']}: not in Reg_02")
        continue
    for col, field in ((8, "supportedAsylum"), (11, "contingencyAccommodation")):
        if not isinstance(row[col], float) or int(row[col]) != area[field]:
            area_diffs.append(f"{code} {area['areaName']} {field}: table {row[col]} site {area[field]}")
reg_total = int(sum(row[8] for row in table_areas.values() if isinstance(row[8], float)))
print(f"  {'ok  ' if not area_diffs else 'DIFF'} {len(site_areas)} place-page support and contingency counts against Reg_02")
for line in area_diffs[:20]:
    print(f"       {line}")
if area_diffs:
    failures.append("place-page counts")
check("Reg_02 areas summed, against the Asy_D09 national total", reg_total, d09_total)

if RELEASES_PATH.exists():
    releases = json.loads(RELEASES_PATH.read_text())["releases"]
    current = releases[0]
    print(f"\nlocal-route-releases.json: current {current['snapshotDate']}, previous {releases[1]['snapshotDate'] if len(releases) > 1 else 'none'}")
    if current["snapshotDate"] != LOCAL["snapshotDate"]:
        failures.append("releases file current date")
        print(f"  DIFF current release {current['snapshotDate']} against the mart's {LOCAL['snapshotDate']}")
    held = {code: row["supportedAsylum"] for code, row in current["areas"].items()}
    stray = [code for code, area in site_areas.items() if held.get(code) != area["supportedAsylum"]]
    print(f"  {'ok  ' if not stray else 'DIFF'} current release in the releases file matches the mart for every area")
    if stray:
        failures.append("releases file current counts")

if "--dist" in sys.argv:
    dist = ROOT / "dist"
    if not dist.exists():
        sys.exit("--dist needs a build: npm run build")

    def page_text(rel):
        html = (dist / rel).read_text()
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))

    print("\nBuilt pages")
    for rel in ("index.html", "explained/how-many-asylum-seekers-are-in-the-uk/index.html"):
        text = page_text(rel)
        for label, value in (("on support", d09_total), ("in hotels", d09_hotel)):
            shown = f"{value:,}" in text
            print(f"  {'ok  ' if shown else 'DIFF'} {rel} prints {value:,} ({label})")
            if not shown:
                failures.append(f"{rel} {label}")

    missing = []
    checked = 0
    for page in sorted((dist / "places").glob("*/index.html")):
        html = page.read_text()
        code = re.search(r'"identifier"\s*:\s*"([EWSN]\d{8})"', html) or re.search(r"\b([EWSN]\d{8})\b", html)
        if not code or code.group(1) not in site_areas:
            continue
        title = re.search(r"<title>([^<]*)</title>", html).group(1)
        if title.startswith("Redirecting to:"):
            continue  # /places/<code>/ stubs that point at the named page
        area = site_areas[code.group(1)]
        checked += 1
        if f"{area['supportedAsylum']:,}" not in title:
            missing.append(f"{page.parent.name}: title '{title}' lacks {area['supportedAsylum']:,}")
    print(f"  {'ok  ' if not missing else 'DIFF'} place page titles carry the Reg_02 count ({checked} place pages)")
    for line in missing[:20]:
        print(f"       {line}")
    if missing:
        failures.append("place page titles")

if failures:
    print(f"\nFAIL: {len(failures)} headline check(s) differ from the Home Office tables: {', '.join(failures)}")
    sys.exit(1)
print("\nAll headline counts match the Home Office tables.")
