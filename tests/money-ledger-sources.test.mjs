import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../scripts/lib/csv-parser.mjs";

// The site's promise, printed on its own homepage, is that every number links to the
// release it came from. On 23 August the most prominent number on the site did not: the
// £5.77M daily hotel cost carried href="citing Home Office 2024/25", which resolved to a
// 404 on asylumstats.co.uk itself.
//
// The cause was one unquoted comma in data/manual/asylum-contract-ledger.csv. A source
// title read "Asylum accommodation in the UK (Migration Observatory), citing Home Office
// 2024/25", the comma split it into two columns, and every field after it shifted by one:
// the note landed in source_url, the URL landed in confidence, and "high" landed in notes.
// Nothing failed. The row still parsed, the page still built, and the link still rendered.

const ledger = readFileSync(join(process.cwd(), "data/manual/asylum-contract-ledger.csv"), "utf8");
const rows = parseCsv(ledger);
const header = ledger.split("\n")[0].split(",");

const moneyLedger = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/live/money-ledger.json"), "utf8")
);

describe("asylum contract ledger", () => {
  it("has rows", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("gives every row exactly the declared columns", () => {
    for (const row of rows) {
      const keys = Object.keys(row);
      expect(keys.length, `${row.record_id}: ${keys.length} fields, header has ${header.length}`)
        .toBe(header.length);
    }
  });

  it("puts a URL in source_url and nothing else", () => {
    for (const row of rows) {
      if (!row.source_url) continue;
      expect(row.source_url.trim(), `${row.record_id} source_url`).toMatch(/^https?:\/\//);
    }
  });

  // The tell that the columns have shifted: a URL turning up somewhere that should hold a
  // one-word confidence level, or a confidence level that is not one of the three.
  it("keeps confidence to a confidence level", () => {
    for (const row of rows) {
      if (!row.confidence) continue;
      expect(row.confidence.trim(), `${row.record_id} confidence`).toMatch(/^(high|medium|low)$/);
    }
  });
});

describe("the published money ledger", () => {
  it("links every record that claims a source to a real URL", () => {
    for (const record of moneyLedger.records) {
      if (!record.sourceUrl) continue;
      expect(record.sourceUrl, `${record.recordId} sourceUrl`).toMatch(/^https?:\/\//);
    }
  });

  // Named, because it is the figure the homepage leads with and the one that has been
  // misattributed twice: first to the NAO, which publishes no per-day figure at all, then
  // to a Home Office factsheet that 404s. CDP-2025-0184 states it verbatim.
  it("sources the daily hotel cost to the release that states it", () => {
    const daily = moneyLedger.records.find((r) => r.recordId === "money_home-office-daily-hotel-cost");
    expect(daily).toBeDefined();
    expect(daily.valueGbp).toBe(5_770_000);
    expect(daily.periodLabel).toBe("2024/25 average");
    expect(daily.sourceUrl).toContain("commonslibrary.parliament.uk");
    expect(daily.sourceTitle).toContain("CDP-2025-0184");
    expect(daily.confidence).toBe("high");
  });
});
