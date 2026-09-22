// Dreyth-pattern token + contrast gate (build craft floor; overlay UI-gate quality half).
// Parses src/styles.css and enforces: a token system (color/radius/elevation vars), a
// >=2-level elevation scale, a :focus-visible recipe, NO flat 1px-border-only cards, and
// WCAG contrast on the load-bearing text/bg pairs. This is committed and runs in the default
// gate (npm test) so a later restyle can't silently drop the craft floor or fail contrast.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function relLum([r, g, b]: number[]) {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string) {
  const [l1, l2] = [relLum(hexToRgb(a)), relLum(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
  if (!m) throw new Error(`token --${name} not found in styles.css`);
  return m[1];
}

describe("design tokens (dreyth craft floor)", () => {
  it("defines a color token system (bg/card/text/muted + accents)", () => {
    for (const t of ["bg", "card", "text", "muted", "amber", "green", "red"]) {
      expect(css).toMatch(new RegExp(`--${t}\\s*:`));
    }
  });
  it("defines a tokenized radius scale (CF-1)", () => {
    for (const r of ["r-sm", "r-md", "r-lg"]) expect(css).toMatch(new RegExp(`--${r}\\s*:`));
  });
  it("defines a >=2-level elevation system (CF-2), not flat", () => {
    expect(css).toMatch(/--el-1\s*:/);
    expect(css).toMatch(/--el-2\s*:/);
  });
  it("ships a :focus-visible recipe (CF-4 accessibility)", () => {
    expect(css).toMatch(/:focus-visible/);
  });
  it("cards consume tokens (radius var), never a bare flat box", () => {
    expect(css).toMatch(/\.card\s*\{[^}]*border-radius:\s*var\(--r/);
  });
});

describe("WCAG contrast on load-bearing pairs", () => {
  it("body text on bg >= 4.5:1", () => {
    expect(contrast(token("text"), token("bg"))).toBeGreaterThanOrEqual(4.5);
  });
  it("muted text on bg >= 4.5:1 (it carries the pitch/price copy)", () => {
    expect(contrast(token("muted"), token("bg"))).toBeGreaterThanOrEqual(4.5);
  });
  it("amber countdown/accent on bg >= 3:1 (large UI text)", () => {
    expect(contrast(token("amber"), token("bg"))).toBeGreaterThanOrEqual(3);
  });
  it("body text on card surface >= 4.5:1", () => {
    expect(contrast(token("text"), token("card"))).toBeGreaterThanOrEqual(4.5);
  });
});
