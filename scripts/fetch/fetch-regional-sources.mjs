import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/regional_sources");

const endpoints = [
  {
    fileName: "nwrsmp-media.json",
    url: "https://northwestrsmp.org.uk/wp-json/wp/v2/media?search=xls&per_page=100"
  },
  {
    fileName: "nwrsmp-data-page.json",
    url: "https://northwestrsmp.org.uk/wp-json/wp/v2/pages?slug=data-and-insights&_fields=id,slug,title,link,modified,content"
  }
];

mkdirSync(rawDir, { recursive: true });

for (const endpoint of endpoints) {
  const response = execFileSync("curl", ["-sS", "-L", endpoint.url], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  });

  writeFileSync(path.join(rawDir, endpoint.fileName), `${response.trim()}\n`);
}

console.log(`Fetched ${endpoints.length} regional source files.`);
