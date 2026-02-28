import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileSha256, readCsv } from "../lib/csv-parser.mjs";

const inputPaths = {
  nwrsmpMedia: path.resolve("data/raw/regional_sources/nwrsmp-media.json"),
  nwrsmpPage: path.resolve("data/raw/regional_sources/nwrsmp-data-page.json"),
  watchlist: path.resolve("data/manual/regional-source-watch.csv")
};

const canonicalDir = path.resolve("data/canonical/regional_sources");
const liveDir = path.resolve("src/data/live");

function ensureCleanDir(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeNdjson(filePath, rows) {
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function decodeEntities(value) {
  return String(value ?? "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#038;", "&")
    .replaceAll("&#8211;", "-")
    .replaceAll("&#8217;", "'")
    .replaceAll("&#8220;", "\"")
    .replaceAll("&#8221;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"");
}

function stripHtml(value) {
  return decodeEntities(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function cleanText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function splitPipeList(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function priorityWeight(priority) {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function sortByPriorityAndOrganisation(left, right) {
  return (
    priorityWeight(left.historicPriority) - priorityWeight(right.historicPriority) ||
    left.organisation.localeCompare(right.organisation)
  );
}

function extractParagraphs(html) {
  return [...String(html ?? "").matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function dedupeBy(rows, getKey) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = getKey(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildWatchEntries(rows, group, defaultPriority = "medium") {
  return rows
    .filter((row) => row.group === group)
    .map((row) => ({
      entryId: row.entry_id,
      organisation: row.organisation,
      regionName: row.region_name,
      coverage: row.coverage,
      currentUrl: row.current_url,
      historicUrl: row.historic_url,
      historicPriority: row.historic_priority || defaultPriority,
      formats: splitPipeList(row.formats),
      routeFocus: splitPipeList(row.route_focus),
      recommendedUse: row.recommended_use,
      notes: row.notes
    }))
    .sort(sortByPriorityAndOrganisation);
}

ensureCleanDir(canonicalDir);
mkdirSync(liveDir, { recursive: true });

const nwrsmpMedia = JSON.parse(readFileSync(inputPaths.nwrsmpMedia, "utf8"));
const [nwrsmpPage] = JSON.parse(readFileSync(inputPaths.nwrsmpPage, "utf8"));
const watchlistRows = readCsv(inputPaths.watchlist);

const nwrsmpParagraphs = extractParagraphs(nwrsmpPage?.content?.rendered ?? "");
const meaningfulNwrsmpParagraphs = nwrsmpParagraphs.filter(
  (paragraph) => paragraph.length > 20 && paragraph.toLowerCase() !== "home"
);
const dashboardMatch = String(nwrsmpPage?.content?.rendered ?? "").match(/<param name="name" value="([^"]+)"/i);
const dashboardPath = dashboardMatch?.[1] ?? null;
const dashboardUrl = dashboardPath ? `https://public.tableau.com/views/${dashboardPath}?:showVizHome=no` : null;

const nwrsmpDocuments = dedupeBy(
  nwrsmpMedia
    .filter(
      (item) =>
        item?.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
        /north west public accessible/i.test(cleanText(item?.title?.rendered))
    )
    .map((item) => ({
      title: cleanText(item.title?.rendered),
      publishedAt: String(item.date_gmt || item.date || "").slice(0, 10),
      sourceUrl: item.source_url,
      fileSizeBytes: item.media_details?.filesize ?? null,
      format: "xlsx"
    }))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.title.localeCompare(right.title)),
  (row) => `${row.title}|${row.fileSizeBytes ?? "na"}`
);

const regionalPartners = buildWatchEntries(watchlistRows, "regional_partner", "medium");
const similarOrganisations = buildWatchEntries(watchlistRows, "similar_organisation", "medium");
const archiveTools = buildWatchEntries(watchlistRows, "archive_tool", "high");
const archivedResearchInputs = buildWatchEntries(watchlistRows, "archived_research_input", "high");

const liveOutput = {
  summary: {
    regionalPartnerCount: regionalPartners.length,
    similarOrganisationCount: similarOrganisations.length,
    archiveToolCount: archiveTools.length,
    archivedResearchInputCount: archivedResearchInputs.length,
    nwrsmpWorkbookCount: nwrsmpDocuments.length,
    nwrsmpHistoricWorkbookCount: Math.max(0, nwrsmpDocuments.length - 1)
  },
  nwrsmp: {
    pageTitle: cleanText(nwrsmpPage?.title?.rendered ?? "Data and insights"),
    pageUrl: nwrsmpPage?.link ?? "https://northwestrsmp.org.uk/data-and-insights/",
    dashboardUrl,
    dashboardName: dashboardPath,
    introNote:
      meaningfulNwrsmpParagraphs.find((paragraph) => /interactive|tableau|excel|data/i.test(paragraph)) ??
      meaningfulNwrsmpParagraphs[0] ??
      "",
    provenanceNote:
      meaningfulNwrsmpParagraphs.find((paragraph) => /source data owners|not provided by the rsmp/i.test(paragraph)) ??
      "",
    documents: nwrsmpDocuments
  },
  regionalPartners,
  similarOrganisations,
  archiveTools,
  archivedResearchInputs
};

writeNdjson(path.join(canonicalDir, "nwrsmp-workbooks.ndjson"), nwrsmpDocuments);
writeNdjson(path.join(canonicalDir, "regional-partners.ndjson"), regionalPartners);
writeNdjson(path.join(canonicalDir, "similar-organisations.ndjson"), similarOrganisations);
writeNdjson(path.join(canonicalDir, "archive-tools.ndjson"), archiveTools);
writeNdjson(path.join(canonicalDir, "archived-research-inputs.ndjson"), archivedResearchInputs);
writeJson(path.join(canonicalDir, "manifest.json"), {
  datasetId: "regional_sources",
  generatedAt: new Date().toISOString(),
  inputs: [
    {
      path: inputPaths.watchlist,
      fileSha256: fileSha256(inputPaths.watchlist)
    },
    {
      path: inputPaths.nwrsmpMedia,
      fileSha256: fileSha256(inputPaths.nwrsmpMedia)
    },
    {
      path: inputPaths.nwrsmpPage,
      fileSha256: fileSha256(inputPaths.nwrsmpPage)
    }
  ],
  outputs: {
    live: "src/data/live/regional-source-watch.json",
    nwrsmpWorkbookCount: nwrsmpDocuments.length,
    regionalPartnerCount: regionalPartners.length,
    similarOrganisationCount: similarOrganisations.length,
    archiveToolCount: archiveTools.length,
    archivedResearchInputCount: archivedResearchInputs.length
  }
});
writeJson(path.join(liveDir, "regional-source-watch.json"), liveOutput);

console.log(
  `Transformed ${nwrsmpDocuments.length} North West workbooks, ${regionalPartners.length} regional partner leads, ${similarOrganisations.length} synthesis leads, and ${archivedResearchInputs.length} archived research leads.`
);
