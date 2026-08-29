import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/hotel_entities");
const manifestDir = path.resolve("data/raw/manifests");

const archiveSnapshotUrl =
  "https://web.archive.org/web/20241213115031/https://howfarfrommydoorstep.github.io/clive/hotels.json";

// Bounded, and allowed to fail loudly but quickly. This reads a Wayback snapshot of a
// third-party GitHub Pages site, so it is two hops of someone else's uptime away from us.
// On 27 August 2026 web.archive.org refused connections and this fetch took the whole
// refresh down with it: routes, tribunals and small boats had all already succeeded and
// none of them reached the commit step. Same shape as the www.wsmp.wales failure of
// 17 August. The step is now continue-on-error in the workflow; these bounds stop it
// hanging first.
function curlJson(url) {
  const output = execFileSync(
    "curl",
    ["-sS", "-L", "-f", "--connect-timeout", "60", "--max-time", "300",
     "--retry", "3", "--retry-delay", "5", "-A", "Mozilla/5.0", url],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
  );

  return JSON.parse(output);
}

function hashId(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

// The upstream page 404s: howfarfrommydoorstep.github.io/clive/hotels.json is gone, so
// this Wayback capture of 26 August 2025 is the only copy and its content can never
// change. Re-fetching it every week bought nothing and cost the entire refresh on
// 27 August 2026, when web.archive.org would not answer inside the timeout.
//
// The snapshot is committed alongside this script. The network is touched only when it
// is missing, which is a cold clone, and then with bounds generous enough for Wayback
// rather than the ones tuned for a live host.
const snapshotPath = path.join(rawDir, "archive-snapshot.json");
let rawLeads;
if (existsSync(snapshotPath)) {
  rawLeads = JSON.parse(readFileSync(snapshotPath, "utf8"));
  process.stdout.write(`Using the committed archive snapshot (${rawLeads.length} records).\n`);
} else {
  rawLeads = curlJson(archiveSnapshotUrl);
  writeFileSync(snapshotPath, `${JSON.stringify(rawLeads, null, 2)}\n`);
  process.stdout.write(`Fetched and stored the archive snapshot (${rawLeads.length} records).\n`);
}
const leads = rawLeads
  .map((lead) => ({
    leadId: `archive_lead_${hashId([lead.Name, String(lead.Latitude), String(lead.Longitude)])}`,
    leadName: String(lead.Name ?? "").trim(),
    latitude: typeof lead.Latitude === "number" ? lead.Latitude : Number(lead.Latitude),
    longitude: typeof lead.Longitude === "number" ? lead.Longitude : Number(lead.Longitude)
  }))
  .filter((lead) => lead.leadName.length > 0)
  .sort((left, right) => left.leadName.localeCompare(right.leadName));

const output = {
  generatedAt: new Date().toISOString(),
  datasetId: "hotel_archive_leads",
  source: {
    name: "migranthotels.net archive snapshot",
    archiveSnapshotUrl,
    // 26 Aug 2025 was the capture date of migranthotels.net, copied onto this file by
    // mistake. The Wayback index holds exactly one capture of clive/hotels.json and it
    // is 13 Dec 2024. Replay of it 404s, so the index is the only evidence it exists,
    // which is why the link checker verifies captures through CDX rather than replay.
    archiveSnapshotDate: "2024-12-13",
    originalUrl: "https://howfarfrommydoorstep.github.io/clive/hotels.json"
  },
  leadCount: leads.length,
  leads
};

const outputPath = path.join(rawDir, "archive-hotel-leads.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

writeFileSync(
  path.join(manifestDir, "hotel_entities.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      datasetId: "hotel_entities",
      sourceUrl: archiveSnapshotUrl,
      files: [
        {
          fileName: "archive-hotel-leads.json",
          sizeBytes: statSync(outputPath).size,
          leadCount: leads.length
        }
      ]
    },
    null,
    2
  )}\n`
);

console.log(`Fetched ${leads.length} archived hotel leads from the August 26, 2025 snapshot.`);
