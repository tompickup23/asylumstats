import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/**
 * The privacy policy said "It does not use analytics" and "There are no third-party
 * scripts loaded" while BaseLayout loaded the Cloudflare Web Analytics beacon on every
 * page. Both were true when written and stopped being true when the beacon went in,
 * because nothing tied the policy to the layout. An external audit of the site's
 * privacy wording missed it too; it was found by reading the built HTML.
 *
 * So the policy is checked against what the layout actually loads. If the beacon
 * goes, the disclosure may go with it; while it stays, the policy has to name it and
 * may not carry either of the sentences that were false.
 */
describe("the privacy policy describes the scripts the layout loads", () => {
  const layout = read("src/layouts/BaseLayout.astro");
  const privacy = read("src/pages/privacy.astro");
  const beaconLoaded = /static\.cloudflareinsights\.com\/beacon\.min\.js/.test(layout);

  it("names Cloudflare Web Analytics whenever the beacon is in the layout", () => {
    if (!beaconLoaded) return;
    expect(privacy).toMatch(/Cloudflare Web Analytics/);
  });

  it("does not claim there are no analytics or no third-party scripts while it loads one", () => {
    if (!beaconLoaded) return;
    expect(privacy).not.toMatch(/does not use analytics/i);
    expect(privacy).not.toMatch(/no analytics scripts/i);
    expect(privacy).not.toMatch(/no third-party\s+scripts/i);
  });

  it("names the postcode lookup, which sends what the visitor types to a third party", () => {
    const layoutCsp = layout.match(/connect-src[^;]*/)?.[0] ?? "";
    if (!/api\.postcodes\.io/.test(layoutCsp)) return;
    expect(privacy).toMatch(/postcodes\.io/);
  });

  it("keeps the footer from promising more than the hosts deliver", () => {
    // IP addresses reach GitHub and Cloudflare to serve the page, and the ICO treats
    // an IP address as an online identifier. "No personal data collected" was
    // wider than that, so the footer must not say it.
    expect(layout).not.toMatch(/No personal data collected/);
  });

  it("states a retention position", () => {
    expect(privacy).toMatch(/<h2>Retention<\/h2>/);
  });
});
