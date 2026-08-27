import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/hotel_entities");
const manifestDir = path.resolve("data/raw/manifests");

const archiveSnapshotUrl =
  "https://web.archive.org/web/20250826101522/https://howfarfrommydoorstep.github.io/clive/hotels.json";

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
    ["-sS", "-L", "-f", "--connect-timeout", "15", "--max-time", "90",
     "-A", "Mozilla/5.0", url],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
  );

  return JSON.parse(output);
}

function hashId(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

const rawLeads = curlJson(archiveSnapshotUrl);
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
    archiveSnapshotDate: "2025-08-26",
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
