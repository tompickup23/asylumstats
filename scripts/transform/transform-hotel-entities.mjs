import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const generatedAt = new Date().toISOString();

const sourceFiles = {
  siteLedger: path.resolve("data/hotel-source-ledger.csv"),
  areaSightings: path.resolve("data/manual/hotel-area-sightings.csv"),
  entityLinks: path.resolve("data/manual/hotel-entity-links.csv"),
  integritySignals: path.resolve("data/manual/hotel-integrity-signals.csv"),
  asylumFinance: path.resolve("src/data/live/asylum-finance.json")
};

const canonicalDir = path.resolve("data/canonical/hotel_entities");
const martsDir = path.resolve("data/marts/hotel_entities");
const liveDir = path.resolve("src/data/live");

const confidenceRank = {
  low: 1,
  medium: 2,
  high: 3
};

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

function hashId(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headerRow = [], ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim());

  return dataRows
    .filter((dataRow) => dataRow.some((value) => String(value).trim().length > 0))
    .map((dataRow) =>
      Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""]))
    );
}

function readCsv(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function parseNumber(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function maxConfidence(values) {
  return values.reduce(
    (best, current) =>
      confidenceRank[current] > confidenceRank[best] ? current : best,
    "low"
  );
}

function matchesProviderRegion(provider, regionName) {
  if (provider.regions.includes(regionName)) {
    return true;
  }

  if (provider.regions.includes("Midlands") && ["East Midlands", "West Midlands"].includes(regionName)) {
    return true;
  }

  if (
    provider.regions.includes("South of England") &&
    ["London", "South East", "South West"].includes(regionName)
  ) {
    return true;
  }

  return false;
}

function regionProvider(regionName, providers) {
  return providers.find((provider) => matchesProviderRegion(provider, regionName)) ?? null;
}

function isOwnerRole(linkRole) {
  return ["freeholder", "leaseholder", "owner_group"].includes(linkRole);
}

function isOperatorRole(linkRole) {
  return ["operator", "manager", "brand_operator"].includes(linkRole);
}

function pickBestLink(links, predicate) {
  return [...links]
    .filter((link) => predicate(link.linkRole))
    .sort((left, right) => {
      const confidenceDelta =
        confidenceRank[right.confidence] - confidenceRank[left.confidence];
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return (right.evidenceCount ?? 0) - (left.evidenceCount ?? 0);
    })[0] ?? null;
}

function visibilityClass(namedCount, unnamedCount) {
  if (unnamedCount > 0 && namedCount === 0) {
    return "all_unnamed";
  }

  if (unnamedCount > 0 && namedCount > 0) {
    return "mixed";
  }

  return "named_only";
}

function sortByDateDescending(leftDate, rightDate) {
  return String(rightDate ?? "").localeCompare(String(leftDate ?? ""));
}

function areaKeyOf(areaName, areaCode) {
  return [areaName, areaCode ?? ""].join("|");
}

const asylumFinance = readJson(sourceFiles.asylumFinance);
const providerCatalog = asylumFinance.providers;

const rawSites = readCsv(sourceFiles.siteLedger).map((row) => ({
  site_id: row.site_id,
  site_name: row.site_name,
  site_type: normalizeText(row.site_type),
  area_name: row.area_name,
  area_code: normalizeText(row.area_code),
  region_name: row.region_name,
  country_name: row.country_name,
  status: row.status,
  evidence_class: row.evidence_class,
  confidence: row.confidence,
  people_housed_reported: parseNumber(row.people_housed_reported),
  date_first_public: normalizeText(row.date_first_public),
  date_last_public: row.date_last_public,
  operator_name: normalizeText(row.operator_name),
  source_title: row.source_title,
  source_url: row.source_url,
  notes: normalizeText(row.notes)
}));

const aggregatedEntityLinks = [];
const entityLinkGroups = new Map();

for (const row of readCsv(sourceFiles.entityLinks)) {
  const groupKey = [
    row.site_id,
    row.entity_name,
    normalizeText(row.company_number) ?? "",
    row.link_role
  ].join("|");

  if (!entityLinkGroups.has(groupKey)) {
    entityLinkGroups.set(groupKey, {
      siteId: row.site_id,
      entityName: row.entity_name,
      companyNumber: normalizeText(row.company_number),
      linkRole: row.link_role,
      confidenceValues: [],
      sourceUrls: [],
      sources: [],
      notes: []
    });
  }

  const group = entityLinkGroups.get(groupKey);
  group.confidenceValues.push(row.confidence);
  group.sourceUrls.push(row.source_url);
  group.sources.push({
    title: row.source_title,
    url: row.source_url
  });
  if (normalizeText(row.notes)) {
    group.notes.push(row.notes.trim());
  }
}

for (const group of entityLinkGroups.values()) {
  const canonicalLink = {
    link_id: `hotel_link_${hashId([
      group.siteId,
      group.entityName,
      group.companyNumber ?? "",
      group.linkRole
    ])}`,
    site_id: group.siteId,
    entity_name: group.entityName,
    company_number: group.companyNumber,
    link_role: group.linkRole,
    confidence: maxConfidence(group.confidenceValues),
    evidence_count: unique(group.sourceUrls).length,
    source_urls: unique(group.sourceUrls),
    generated_at: generatedAt,
    notes: unique(group.notes).join(" | ") || null
  };

  aggregatedEntityLinks.push({
    ...canonicalLink,
    siteId: canonicalLink.site_id,
    entityName: canonicalLink.entity_name,
    companyNumber: canonicalLink.company_number,
    linkRole: canonicalLink.link_role,
    evidenceCount: canonicalLink.evidence_count,
    sourceUrls: canonicalLink.source_urls,
    sources: unique(
      group.sources.map((source) => JSON.stringify(source))
    ).map((source) => JSON.parse(source)),
    generatedAt: canonicalLink.generated_at
  });
}

const siteLinksMap = new Map();
for (const link of aggregatedEntityLinks) {
  if (!siteLinksMap.has(link.siteId)) {
    siteLinksMap.set(link.siteId, []);
  }
  siteLinksMap.get(link.siteId).push(link);
}

const rawSignalRows = readCsv(sourceFiles.integritySignals);

const canonicalSignals = rawSignalRows.map((row) => ({
  signal_id: `hotel_signal_${hashId([row.subject_id, row.signal_type, row.headline])}`,
  signal_type: row.signal_type,
  severity: row.severity,
  subject_type: row.subject_type,
  subject_id: row.subject_id,
  headline: normalizeText(row.headline),
  detail: normalizeText(row.detail),
  route_family: normalizeText(row.route_family),
  confidence: normalizeText(row.confidence),
  source_urls: [row.source_url],
  generated_at: generatedAt,
  notes: normalizeText(row.notes)
}));

const liveSignals = canonicalSignals.map((signal) => ({
  signalId: signal.signal_id,
  signalType: signal.signal_type,
  severity: signal.severity,
  subjectType: signal.subject_type,
  subjectId: signal.subject_id,
  headline: signal.headline,
  detail: signal.detail,
  routeFamily: signal.route_family,
  confidence: signal.confidence,
  sourceUrls: signal.source_urls,
  sourceTitle:
    rawSignalRows.find(
      (row) =>
        row.subject_id === signal.subject_id &&
        row.signal_type === signal.signal_type &&
        row.headline === signal.headline
    )?.source_title ?? null,
  generatedAt: signal.generated_at,
  notes: signal.notes
}));

const siteSignalsMap = new Map();
for (const signal of liveSignals) {
  if (!siteSignalsMap.has(signal.subjectId)) {
    siteSignalsMap.set(signal.subjectId, []);
  }
  siteSignalsMap.get(signal.subjectId).push(signal);
}

const siteRows = rawSites
  .map((site) => {
    const entityLinks = (siteLinksMap.get(site.site_id) ?? []).sort((left, right) => {
      const confidenceDelta =
        confidenceRank[right.confidence] - confidenceRank[left.confidence];
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return (right.evidenceCount ?? 0) - (left.evidenceCount ?? 0);
    });
    const integritySignals = (siteSignalsMap.get(site.site_id) ?? []).sort((left, right) =>
      left.severity.localeCompare(right.severity)
    );
    const ownerLink = pickBestLink(entityLinks, isOwnerRole);
    const operatorLink = pickBestLink(entityLinks, isOperatorRole);
    const primeProvider =
      site.status === "current" ? regionProvider(site.region_name, providerCatalog) : null;
    const entityCoverage =
      entityLinks.length === 0
        ? "unresolved"
        : ownerLink && operatorLink
          ? "documented"
          : "partial";

    return {
      ...site,
      operator_name: operatorLink?.entityName ?? site.operator_name,
      primeProvider,
      ownerName: ownerLink?.entityName ?? null,
      operatorName: operatorLink?.entityName ?? site.operator_name ?? null,
      entityCoverage,
      entityLinks,
      integritySignals,
      integritySignalCount: integritySignals.length,
      evidenceSources: [{ title: site.source_title, url: site.source_url }]
    };
  })
  .sort((left, right) => {
    if (left.status !== right.status) {
      return left.status.localeCompare(right.status);
    }

    return left.site_name.localeCompare(right.site_name);
  });

const canonicalSiteRows = siteRows.map((site) => ({
  site_id: site.site_id,
  site_name: site.site_name,
  site_type: site.site_type,
  area_name: site.area_name,
  area_code: site.area_code,
  region_name: site.region_name,
  country_name: site.country_name,
  status: site.status,
  evidence_class: site.evidence_class,
  confidence: site.confidence,
  people_housed_reported: site.people_housed_reported,
  date_first_public: site.date_first_public,
  date_last_public: site.date_last_public,
  operator_name: site.operator_name,
  source_title: site.source_title,
  source_url: site.source_url,
  notes: site.notes
}));

const siteCounts = {
  totalNamedSites: siteRows.length,
  currentNamedSites: siteRows.filter((site) => site.status === "current").length,
  historicalNamedSites: siteRows.filter((site) => site.status === "historical").length,
  parliamentaryReferenceSites: siteRows.filter(
    (site) => site.evidence_class === "parliamentary_reference"
  ).length
};

const currentNamedSites = siteRows.filter((site) => site.status === "current");
const sitesWithAnyEntityLinks = currentNamedSites.filter((site) => site.entityLinks.length > 0);
const sitesWithOwnerLinks = currentNamedSites.filter((site) =>
  site.entityLinks.some((link) => isOwnerRole(link.linkRole))
);
const sitesWithOperatorLinks = currentNamedSites.filter((site) =>
  site.entityLinks.some((link) => isOperatorRole(link.linkRole))
);
const fullyResolvedSites = currentNamedSites.filter((site) => site.entityCoverage === "documented");
const unresolvedSites = currentNamedSites.filter((site) => site.entityCoverage === "unresolved");

const manualAreaSightings = readCsv(sourceFiles.areaSightings);
const derivedAreaGroups = new Map();

for (const site of siteRows) {
  const areaKey = areaKeyOf(site.area_name, site.area_code);

  if (!derivedAreaGroups.has(areaKey)) {
    derivedAreaGroups.set(areaKey, {
      areaName: site.area_name,
      areaCode: site.area_code,
      regionName: site.region_name,
      countryName: site.country_name,
      currentNamedSiteCount: 0,
      historicalNamedSiteCount: 0,
      parliamentaryReferenceCount: 0,
      unnamedSiteCount: 0,
      peopleHousedReported: null,
      lastPublicDate: site.date_last_public,
      sourceTitle: site.source_title,
      sourceUrl: site.source_url,
      notes: site.notes
    });
  }

  const area = derivedAreaGroups.get(areaKey);
  if (site.status === "current") {
    area.currentNamedSiteCount += 1;
  }
  if (site.status === "historical") {
    area.historicalNamedSiteCount += 1;
  }
  if (site.evidence_class === "parliamentary_reference") {
    area.parliamentaryReferenceCount += 1;
  }
  if (sortByDateDescending(area.lastPublicDate, site.date_last_public) > 0) {
    area.lastPublicDate = site.date_last_public;
    area.sourceTitle = site.source_title;
    area.sourceUrl = site.source_url;
    area.notes = site.notes;
  }
}

for (const row of manualAreaSightings) {
  const areaKey = areaKeyOf(row.area_name, normalizeText(row.area_code));

  if (!derivedAreaGroups.has(areaKey)) {
    derivedAreaGroups.set(areaKey, {
      areaName: row.area_name,
      areaCode: normalizeText(row.area_code),
      regionName: normalizeText(row.region_name) ?? "Unknown region",
      countryName: normalizeText(row.country_name) ?? "United Kingdom",
      currentNamedSiteCount: 0,
      historicalNamedSiteCount: 0,
      parliamentaryReferenceCount: 0,
      unnamedSiteCount: 0,
      peopleHousedReported: null,
      lastPublicDate: row.date_last_public,
      sourceTitle: row.source_title,
      sourceUrl: row.source_url,
      notes: normalizeText(row.notes)
    });
  }

  const area = derivedAreaGroups.get(areaKey);
  area.currentNamedSiteCount = Math.max(
    area.currentNamedSiteCount,
    parseNumber(row.named_site_count) ?? 0
  );
  area.unnamedSiteCount = Math.max(
    area.unnamedSiteCount,
    parseNumber(row.unnamed_site_count) ?? 0
  );
  area.peopleHousedReported = parseNumber(row.people_housed_reported) ?? area.peopleHousedReported;
  if (sortByDateDescending(area.lastPublicDate, row.date_last_public) > 0) {
    area.lastPublicDate = row.date_last_public;
    area.sourceTitle = row.source_title || area.sourceTitle;
    area.sourceUrl = row.source_url || area.sourceUrl;
    area.notes = normalizeText(row.notes) ?? area.notes;
  }
  area.notes = normalizeText(row.notes) ?? area.notes;
}

const areaRows = [...derivedAreaGroups.values()]
  .map((area) => {
    const visibleNamedCount = area.currentNamedSiteCount + area.historicalNamedSiteCount;
    const visibilityBase = visibleNamedCount + area.unnamedSiteCount;

    return {
      ...area,
      visibilityClass: visibilityClass(visibleNamedCount, area.unnamedSiteCount),
      visibilityPct:
        visibilityBase > 0
          ? Number(((visibleNamedCount / visibilityBase) * 100).toFixed(1))
          : null
    };
  })
  .sort((left, right) => {
    if (left.unnamedSiteCount !== right.unnamedSiteCount) {
      return right.unnamedSiteCount - left.unnamedSiteCount;
    }

    return String(left.areaName).localeCompare(String(right.areaName));
  });

const primeProviderBreakdown = providerCatalog
  .map((provider) => ({
    provider: provider.provider,
    currentNamedSiteCount: currentNamedSites.filter(
      (site) => site.primeProvider?.provider === provider.provider
    ).length,
    regions: provider.regions,
    sourceUrl: provider.sourceUrl
  }))
  .filter((provider) => provider.currentNamedSiteCount > 0);

const hotelEntityLedger = {
  generatedAt,
  summary: {
    ...siteCounts,
    currentNamedSitesWithAnyEntityLinks: sitesWithAnyEntityLinks.length,
    currentNamedSitesWithOwnerLinks: sitesWithOwnerLinks.length,
    currentNamedSitesWithOperatorLinks: sitesWithOperatorLinks.length,
    currentNamedSitesFullyResolved: fullyResolvedSites.length,
    currentNamedSitesUnresolved: unresolvedSites.length,
    currentNamedSitesWithIntegritySignals: currentNamedSites.filter(
      (site) => site.integritySignals.length > 0
    ).length,
    unnamedOnlyAreaCount: areaRows.filter((area) => area.visibilityClass === "all_unnamed").length,
    totalIntegritySignals: liveSignals.length
  },
  hotelFacts: asylumFinance.hotelFacts,
  sites: siteRows.map((site) => ({
    siteId: site.site_id,
    siteName: site.site_name,
    areaName: site.area_name,
    areaCode: site.area_code,
    regionName: site.region_name,
    countryName: site.country_name,
    status: site.status,
    evidenceClass: site.evidence_class,
    confidence: site.confidence,
    peopleHousedReported: site.people_housed_reported,
    firstPublicDate: site.date_first_public,
    lastPublicDate: site.date_last_public,
    sourceTitle: site.source_title,
    sourceUrl: site.source_url,
    notes: site.notes,
    ownerName: site.ownerName,
    operatorName: site.operatorName,
    entityCoverage: site.entityCoverage,
    entityLinks: site.entityLinks.map((link) => ({
      linkId: link.link_id,
      entityName: link.entityName,
      companyNumber: link.companyNumber,
      linkRole: link.linkRole,
      confidence: link.confidence,
      evidenceCount: link.evidenceCount,
      sourceUrls: link.sourceUrls,
      sources: link.sources,
      notes: link.notes
    })),
    integritySignals: site.integritySignals,
    integritySignalCount: site.integritySignalCount,
    primeProvider: site.primeProvider
      ? {
          provider: site.primeProvider.provider,
          regions: site.primeProvider.regions,
          note: site.primeProvider.note,
          sourceUrl: site.primeProvider.sourceUrl
        }
      : null
  })),
  areas: areaRows,
  primeProviderBreakdown,
  limitations: [
    "The named hotel ledger is intentionally incomplete because the Home Office does not publish a full public site list.",
    "Owner and operator links are only published when the documentary trail is strong enough to support the match.",
    "Prime provider mapping uses the current regional asylum accommodation contract structure and should not be treated as a historical site-by-site contract proof.",
    "Parliamentary-reference rows stay in the ledger to show visibility gaps, but they are not treated as fully corroborated current hotels without stronger local evidence."
  ],
  sources: [
    {
      name: "Hotel site ledger",
      sourceUrl: "https://www.eppingforestdc.gov.uk/news/joint-open-letter-bell-hotel-and-phoenix-hotel/",
      type: "local public evidence"
    },
    {
      name: "Companies House and operator evidence",
      sourceUrl: "https://find-and-update.company-information.service.gov.uk/company/03929881",
      type: "entity resolution"
    },
    {
      name: "Asylum accommodation provider regions",
      sourceUrl: "https://www.gov.uk/government/publications/asylum-accommodation-and-support-contracts",
      type: "official contract"
    }
  ]
};

ensureCleanDir(canonicalDir);
ensureCleanDir(martsDir);

writeNdjson(path.join(canonicalDir, "site-ledger.ndjson"), canonicalSiteRows);
writeNdjson(
  path.join(canonicalDir, "entity-links.ndjson"),
  aggregatedEntityLinks.map((link) => ({
    link_id: link.link_id,
    site_id: link.site_id,
    entity_name: link.entity_name,
    company_number: link.company_number,
    link_role: link.link_role,
    confidence: link.confidence,
    evidence_count: link.evidence_count,
    source_urls: link.source_urls,
    generated_at: link.generated_at,
    notes: link.notes
  }))
);
writeNdjson(path.join(canonicalDir, "integrity-signals.ndjson"), canonicalSignals);

const manifest = {
  generated_at: generatedAt,
  dataset_id: "hotel_entities",
  source_files: Object.entries(sourceFiles).map(([key, filePath]) => ({
    name: key,
    path: path.relative(path.resolve("."), filePath),
    sha256: fileSha256(filePath)
  })),
  counts: {
    site_rows: canonicalSiteRows.length,
    entity_link_rows: aggregatedEntityLinks.length,
    integrity_signal_rows: canonicalSignals.length,
    area_rows: areaRows.length
  }
};

writeJson(path.join(canonicalDir, "manifest.json"), manifest);
writeJson(path.join(martsDir, "hotel-entity-ledger.json"), hotelEntityLedger);
writeJson(path.join(martsDir, "hotel-area-sightings.json"), areaRows);
writeJson(path.join(martsDir, "hotel-entity-summary.json"), hotelEntityLedger.summary);
writeJson(path.join(liveDir, "hotel-entity-ledger.json"), hotelEntityLedger);
writeJson(path.join(liveDir, "hotel-area-sightings.json"), areaRows);
