// Run in an isolated process: route-data resolves its inputs from process.cwd().
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const { getAllAreaCosts } = await server.ssrLoadModule("/src/lib/area-cost.ts");
  process.stdout.write(JSON.stringify(getAllAreaCosts().map(c => ({
    code: c.areaCode, name: c.areaName, dates: c.dates,
    pricedSubtotal: c.m2.pricedSubtotal, unpricedPeople: c.m2.unpricedPeople,
    hotelScenario: c.counts.contingency > 0, burdenShare: c.m1.burdenShare,
    fullExpenditure: c.m2.total
  }))));
} finally { await server.close(); }
