import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectFigures } from "../lib/rendered-figures.mjs";

const dist = resolve("dist");
const figures = collectFigures(dist);
writeFileSync(resolve(dist, "figures.json"), JSON.stringify(figures, null, 2) + "\n");
console.log(`figures: recorded ${figures.length} rendered figures`);
