import { describe, expect, it } from "vitest";
import text from "../public/_headers?raw";

/** Each rule's headers in file order; "! Name" removes what earlier rules gave (Cloudflare Pages). */
function policyFor(path: string): string[] {
  let policies: string[] = [];
  let applies = false;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      applies = pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
    } else if (applies) {
      const [name, ...rest] = line.trim().split(":");
      if (line.trim() === "! Content-Security-Policy") policies = [];
      else if (name === "Content-Security-Policy") policies.push(rest.join(":").trim());
    }
  }
  return policies;
}

const sources = (policy: string, directive: string) =>
  policy.split(";").map((d) => d.trim().split(/\s+/)).find(([name]) => name === directive)?.slice(1) ?? [];

describe("_headers", () => {
  it("never lets the page run strings or inline scripts as code", () => {
    for (const path of ["/", "/index.html", "/assets/index-abc.js", "/assets/build.worker-abc.js"]) {
      const [policy, ...more] = policyFor(path);
      expect(more, path).toEqual([]);
      expect(sources(policy!, "script-src"), path).toEqual(["'self'", "'wasm-unsafe-eval'"]);
      expect(sources(policy!, "default-src"), path).toEqual(["'none'"]);
      expect(sources(policy!, "frame-ancestors"), path).toEqual(["'none'"]);
    }
  });

  it("allows string evaluation only for the WOFF2 workers, which need it", () => {
    const [policy, ...more] = policyFor("/assets/woff2/woff2.worker-abc.js");
    expect(more).toEqual([]);
    expect(sources(policy!, "script-src")).toContain("'unsafe-eval'");
    expect(sources(policy!, "default-src")).toEqual(["'none'"]);
  });
});
