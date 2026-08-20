#!/usr/bin/env node
/**
 * Derive the model's inputs, outputs and run order from the scripts themselves.
 *
 * There are 28 scripts in scripts/model and no documented order to run them in. The
 * ethnic projection they produce is the site's strongest claim, and it is the one
 * figure on the site that cannot be traced: the inputs are gitignored, the
 * intermediates are gitignored, and only the final JSON is committed. Nobody, including
 * us, can currently reproduce MAE 1.71pp, which is also why the 1.71 against 1.72
 * discrepancy and the deterministic-against-stochastic disagreement cannot be settled.
 *
 * The scripts resolve their paths through constants rather than string literals, so
 * this reads each constant's definition and then reports which file each script reads
 * and writes. Anything that writes a file another script reads has to run first, which
 * gives a partial order without anyone having to remember one.
 *
 *   node scripts/audit/model-io-graph.mjs            # table
 *   node scripts/audit/model-io-graph.mjs --order    # suggested run order only
 *   node scripts/audit/model-io-graph.mjs --json     # machine readable
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL_DIR = resolve(ROOT, "scripts/model");

/** Resolve `const NAME = <string or path.join(...)>` well enough to name a file. */
function constantValues(source) {
  const values = new Map();
  const declaration = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;\n]+)/g;
  for (const [, name, rawExpression] of source.matchAll(declaration)) {
    const expression = rawExpression.trim();
    const literals = [...expression.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    if (!literals.length) continue;
    // A path built from join()/resolve() ends in the segment that names the file.
    const candidate = literals.filter((literal) => /[./]/.test(literal)).pop() ?? literals.pop();
    values.set(name, candidate);
  }
  return values;
}

function ioFor(source) {
  const constants = constantValues(source);
  const resolveArg = (arg) => {
    const trimmed = arg.trim();
    const literal = trimmed.match(/^["'`]([^"'`]+)["'`]/);
    if (literal) return literal[1];
    const identifier = trimmed.match(/^([A-Z][A-Z0-9_]*)/);
    if (identifier && constants.has(identifier[1])) return constants.get(identifier[1]);
    return identifier ? `${identifier[1]} (unresolved)` : null;
  };

  const reads = new Set();
  const writes = new Set();
  for (const [, arg] of source.matchAll(/readFileSync\(\s*([^,)]+)/g)) {
    const value = resolveArg(arg);
    if (value) reads.add(basename(value));
  }
  for (const [, arg] of source.matchAll(/writeFileSync\(\s*([^,)]+)/g)) {
    const value = resolveArg(arg);
    if (value) writes.add(basename(value));
  }
  return { reads: [...reads], writes: [...writes] };
}

const scripts = readdirSync(MODEL_DIR)
  .filter((name) => name.endsWith(".mjs"))
  .sort()
  .map((name) => ({ name, ...ioFor(readFileSync(resolve(MODEL_DIR, name), "utf8")) }));

/** Topological order: a script runs after everything that writes what it reads. */
function runOrder(nodes) {
  const producers = new Map();
  for (const node of nodes) {
    for (const output of node.writes) {
      if (!producers.has(output)) producers.set(output, new Set());
      producers.get(output).add(node.name);
    }
  }

  const dependencies = new Map(
    nodes.map((node) => [
      node.name,
      new Set(
        node.reads
          .flatMap((input) => [...(producers.get(input) ?? [])])
          .filter((producer) => producer !== node.name)
      )
    ])
  );

  const ordered = [];
  const remaining = new Set(nodes.map((node) => node.name));
  while (remaining.size) {
    const ready = [...remaining]
      .filter((name) => [...dependencies.get(name)].every((dep) => !remaining.has(dep)))
      .sort();
    if (!ready.length) {
      // A cycle, usually a script that reads and rewrites the same file in place.
      ordered.push({ cycle: [...remaining].sort() });
      break;
    }
    ordered.push({ stage: ready });
    ready.forEach((name) => remaining.delete(name));
  }
  return ordered;
}

const order = runOrder(scripts);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ scripts, order }, null, 2));
} else if (process.argv.includes("--order")) {
  order.forEach((entry, index) => {
    if (entry.cycle) {
      console.log(`\nUNORDERED (mutual or in-place dependencies), run manually:`);
      entry.cycle.forEach((name) => console.log(`  ${name}`));
    } else {
      console.log(`\nStage ${index + 1} (can run in any order within the stage):`);
      entry.stage.forEach((name) => console.log(`  node scripts/model/${name}`));
    }
  });
} else {
  console.log(`\n${scripts.length} model scripts\n`);
  console.log(`${"script".padEnd(34)}${"reads".padEnd(46)}writes`);
  console.log("-".repeat(110));
  for (const script of scripts) {
    console.log(
      `${script.name.padEnd(34)}${(script.reads.join(", ") || "-").slice(0, 44).padEnd(46)}` +
        `${script.writes.join(", ") || "-"}`
    );
  }
  const unresolved = scripts.filter((s) =>
    [...s.reads, ...s.writes].some((f) => f.includes("unresolved"))
  );
  if (unresolved.length) {
    console.log(`\n${unresolved.length} script(s) have a path this cannot resolve statically:`);
    unresolved.forEach((s) => console.log(`  ${s.name}`));
  }
  console.log(`\nRun order: node scripts/audit/model-io-graph.mjs --order`);
}
