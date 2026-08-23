import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The estate brand system says every pairing that carries text is computed rather than
// eyeballed, and that computing it is the point: --text-faint had to be darkened after it
// measured 4.31 and 4.43 on two of the accent washes. This file keeps that true for
// Asylum Stats by reading the tokens the site actually ships and measuring them.

const css = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`No --${name} in src/styles/global.css`);
  return match[1].toLowerCase();
}

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const bg = () => token("bg");
const subtle = () => token("bg-subtle");
const wash = () => token("accent-wash");
const ground = () => token("ground");

describe("brand tokens", () => {
  it("carries the Asylum Stats accent triple from the estate spec", () => {
    expect(token("accent")).toBe("#2f5773");
    expect(token("accent-bright")).toBe("#82abcb");
    expect(token("accent-wash")).toBe("#eef3f7");
  });

  it("carries the shared neutrals, which are identical across the five sites", () => {
    expect(token("bg")).toBe("#ffffff");
    expect(token("bg-subtle")).toBe("#f5f6f7");
    expect(token("border")).toBe("#dbdfe3");
    expect(token("text")).toBe("#171b1f");
    expect(token("text-muted")).toBe("#545c63");
    expect(token("text-faint")).toBe("#616970");
  });

  it("keeps the dark ground for social and Open Graph surfaces", () => {
    expect(token("ground")).toBe("#0f1317");
    expect(token("ground-ink")).toBe("#f4f6f7");
    expect(token("ground-muted")).toBe("#98a3ac");
  });
});

describe("text contrast", () => {
  // Every colour that carries body-sized text, against every ground it can land on.
  const pairs = [
    ["text", [bg, subtle, wash]],
    ["text-muted", [bg, subtle, wash]],
    ["text-faint", [bg, subtle, wash]],
    ["accent", [bg, subtle, wash]],
    ["positive", [bg, subtle, wash]],
    ["warning", [bg, subtle, wash]],
    ["critical", [bg, subtle, wash]]
  ];

  for (const [fg, grounds] of pairs) {
    it(`clears AA for --${fg} on every background it lands on`, () => {
      for (const groundFn of grounds) {
        const measured = ratio(token(fg), groundFn());
        expect(
          measured,
          `--${fg} on ${groundFn()} measured ${measured.toFixed(2)}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("clears AA on the dark ground", () => {
    for (const fg of ["ground-ink", "ground-muted", "accent-bright"]) {
      const measured = ratio(token(fg), ground());
      expect(measured, `--${fg} on the ground measured ${measured.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // White on the accent is the one reversed pairing the site uses, on buttons and the
  // skip link. It is easy to lose by lightening the accent and nothing else would notice.
  it("clears AA for white text on the accent", () => {
    expect(ratio("#ffffff", token("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});
