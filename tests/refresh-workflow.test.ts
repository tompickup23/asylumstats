import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The tribunal step in the refresh job is expected to fail once a quarter: the transform
 * refuses a new MOJ edition until a person re-reads its anchor figures. It sat first in the
 * job with nothing to catch it, so that refusal would have stopped routes, small boats and
 * money as well. These checks keep it parking tribunals alone.
 */
const workflow = readFileSync(resolve(import.meta.dirname ?? __dirname, "../.github/workflows/refresh-data.yml"), "utf8");

/** The text of one step, from its "- name:" line to the next step. */
function step(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, `step "${name}"`).toBeGreaterThan(-1);
  const next = workflow.indexOf("\n      - ", start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

describe("refresh job: a parked tribunal edition", () => {
  it("does not stop the rest of the job", () => {
    const tribunals = step("Fetch and transform MOJ tribunals");
    expect(tribunals).toMatch(/id: tribunals\n/);
    expect(tribunals).toMatch(/continue-on-error: true\n/);
  });

  it("puts back the held edition before routes reads it", () => {
    const keep = step("Keep the held tribunal edition");
    expect(keep).toContain("steps.tribunals.outcome == 'failure'");
    expect(keep).toContain("git checkout -- data/raw/manifests/moj_tribunals.json");
    expect(keep).toContain("cp data/marts/moj_tribunals/tribunal-appeals.json src/data/live/tribunal-appeals.json");
    expect(workflow.indexOf("- name: Keep the held tribunal edition")).toBeLessThan(
      workflow.indexOf("- name: Fetch and transform routes")
    );
  });

  it("opens an issue and ends the run red", () => {
    expect(step("Open an issue for parked tribunals")).toContain("--label tribunals-parked");
    const gate = step("Fail if a secondary source was skipped");
    expect(gate).toContain("TRIBUNALS_OUTCOME: ${{ steps.tribunals.outcome }}");
    expect(gate).toContain('if [ "$TRIBUNALS_OUTCOME" = "failure" ]');
  });
});
