import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Every tracked file, so a DSN cannot hide in a config, a lockfile or a doc.
const tracked = () => execSync("git ls-files -z", { cwd: root }).toString().split("\0").filter(Boolean);

describe("A-92 — error events go to Sentry; the DSN is a server-runtime variable, and at M0 nothing is emitted", () => {
  it("the Sentry SDK is installed in apps/web", () => {
    const pkg = JSON.parse(read("apps/web/package.json"));
    expect(pkg.dependencies["@sentry/nextjs"]).toBeTruthy();
  });

  it("every Sentry config reads its DSN from the environment and hard-codes none", () => {
    const configs = ["apps/web/sentry.server.config.ts", "apps/web/sentry.edge.config.ts", "apps/web/instrumentation-client.ts"];
    for (const c of configs) {
      const src = read(c);
      expect(src, c).toMatch(/dsn:\s*process\.env\.(NEXT_PUBLIC_)?SENTRY_DSN/);
      expect(src, c).not.toMatch(/https:\/\/[0-9a-f]+@/);
    }
  });

  it("no tracked file contains a Sentry DSN value", () => {
    // A DSN is https://<key>@<org>.ingest.<region>.sentry.io/<project>
    const dsn = /https:\/\/[0-9a-f]{16,}@[a-z0-9.-]*ingest[a-z0-9.-]*\.sentry\.io\/\d+/;
    const hits = tracked().filter((f) => {
      try {
        return dsn.test(readFileSync(join(root, f), "utf8"));
      } catch {
        return false;
      }
    });
    expect(hits).toEqual([]);
  });

  it("no code path emits an event at M0 — captureException / captureMessage are not called", () => {
    const src = execSync('git ls-files -z -- "apps/web/*.ts" "apps/web/*.tsx"', { cwd: root })
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((f) => readFileSync(join(root, f), "utf8"))
      .join("\n");
    expect(src).not.toMatch(/Sentry\.capture(Exception|Message|Event)\(/);
  });
});
