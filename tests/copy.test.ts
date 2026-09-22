// File: tests/copy.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED_PAYMENT = /\bverif/i;              // NN-2: matched/confirmed only — nothing stronger
const BANNED_SHARING = /share (your )?(login|password|account)|bypass|circumvent/i;
const NAIRA_LITERAL = /₦ ?[0-9]/;                // NN-3: no hardcoded prices in frontend
const ALLOW = [/how_to_verify/];                 // the /api/proof JSON key names the judge's OWN action

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "_generated" || f === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("COPY_BANNED_TERM gates", () => {
  const files = [...walk("src"), ...walk("convex")];
  it("payment language never exceeds matched/confirmed (NN-2)", () => {
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BANNED_PAYMENT.test(line) && !ALLOW.some((a) => a.test(line))) {
          expect.fail(`COPY_BANNED_TERM ${f}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  });
  it("no sharing/circumvention language (NN-6)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(BANNED_SHARING.test(src), `COPY_BANNED_TERM in ${f}`).toBe(false);
    }
  });
  it("no hardcoded naira literals in frontend (NN-3)", () => {
    for (const f of walk("src")) {
      const src = readFileSync(f, "utf8");
      expect(NAIRA_LITERAL.test(src), `hardcoded price in ${f}`).toBe(false);
    }
  });
});
