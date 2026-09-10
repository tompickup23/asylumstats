/**
 * What Google will actually show of every title and description on the site.
 *
 * Google clips titles and snippets on rendered pixel width, so a character count cannot
 * answer the question: "Bath and North East Somerset" and "Kingston upon Hull, City of"
 * are within one character of each other and 20px apart. This reads the built `dist/`,
 * measures each page's real `<title>` and `<meta name="description">` against the pixel
 * budgets in src/lib/serp.ts, and lists what would be truncated.
 *
 *   node scripts/audit/serp-widths.mjs           report everything over budget
 *   node scripts/audit/serp-widths.mjs --check   exit 1 if anything is over budget
 *   node scripts/audit/serp-widths.mjs --all     report every page, not just failures
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  titleWidth, descriptionWidth, TITLE_LIMIT_PX, DESCRIPTION_LIMIT_PX
} from "../../src/lib/serp.ts";

const DIST = "dist";
const args = new Set(process.argv.slice(2));

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (entry.endsWith(".html")) out.push(path);
  }
  return out;
}

function decode(value) {
  return value
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&apos;", "'");
}

let files;
try {
  files = htmlFiles(DIST);
} catch {
  console.error(`No ${DIST}/ to read. Run \`npm run build\` first.`);
  process.exit(2);
}

const rows = [];
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "");
  const description = decode(
    html.match(/<meta name="description" content="([\s\S]*?)"/)?.[1]?.trim() ?? ""
  );
  // Astro's redirect stubs are a meta-refresh and a link, never indexed and never shown
  // in a result. They have no description by design, so counting them as failures would
  // make --check permanently red.
  if (/^Redirecting to: /.test(title)) continue;

  rows.push({
    page: "/" + relative(DIST, file).replace(/index\.html$/, "").replace(/\.html$/, "/"),
    title, titlePx: titleWidth(title),
    description, descriptionPx: descriptionWidth(description)
  });
}

const longTitles = rows.filter((r) => r.titlePx > TITLE_LIMIT_PX);
const longDescriptions = rows.filter((r) => r.descriptionPx > DESCRIPTION_LIMIT_PX);
const missing = rows.filter((r) => !r.title || !r.description);

const report = args.has("--all") ? rows : [...new Set([...longTitles, ...longDescriptions])];
for (const row of report.sort((a, b) => b.titlePx - a.titlePx)) {
  const flag = (px, limit) => (px > limit ? "OVER " : "     ");
  console.log(row.page);
  console.log(`  ${flag(row.titlePx, TITLE_LIMIT_PX)}title ${String(Math.round(row.titlePx)).padStart(4)}px / ${TITLE_LIMIT_PX}  ${row.title}`);
  console.log(`  ${flag(row.descriptionPx, DESCRIPTION_LIMIT_PX)}desc  ${String(Math.round(row.descriptionPx)).padStart(4)}px / ${DESCRIPTION_LIMIT_PX}  ${row.description.slice(0, 120)}${row.description.length > 120 ? "…" : ""}`);
}

console.log(
  `\n${rows.length} pages: ${longTitles.length} title over ${TITLE_LIMIT_PX}px, ` +
  `${longDescriptions.length} description over ${DESCRIPTION_LIMIT_PX}px, ${missing.length} missing one or the other.`
);

if (args.has("--check") && (longTitles.length || longDescriptions.length || missing.length)) {
  process.exit(1);
}
