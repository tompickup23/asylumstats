import { describe, expect, it } from "vitest";
import { formatRatePer10k } from "../src/lib/rate-format";

describe("formatRatePer10k", () => {
  it("shows one decimal and keeps a trailing zero", () => {
    expect(formatRatePer10k(46.66)).toBe("46.7");
    expect(formatRatePer10k(60.18)).toBe("60.2");
    expect(formatRatePer10k(8)).toBe("8.0");
    expect(formatRatePer10k(1234.56)).toBe("1,234.6");
  });

  it("says n/a rather than inventing a rate", () => {
    expect(formatRatePer10k(null)).toBe("n/a");
    expect(formatRatePer10k(undefined)).toBe("n/a");
    expect(formatRatePer10k(Number.NaN)).toBe("n/a");
  });
});
