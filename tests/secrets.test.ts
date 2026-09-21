import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

// Every tracked and untracked-but-not-ignored file, minus the documents (which
// name the variable to say where it must not be) and this test.
const files = () =>
  execSync("git ls-files -z --cached --others --exclude-standard", { cwd: root })
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((f) => !f.startsWith("docs/") && !f.endsWith(".md") && f !== "tests/secrets.test.ts");

const text = (f: string) => {
  try {
    return readFileSync(join(root, f), "utf8");
  } catch {
    return "";
  }
};

describe("A-100 — the service-role key is a server-runtime variable set in the platform and present in no file", () => {
  it(".env.example names SUPABASE_SERVICE_ROLE_KEY with no value", () => {
    expect(text(".env.example")).toMatch(/^SUPABASE_SERVICE_ROLE_KEY=\s*$/m);
  });

  it("no file assigns a value to a service-role variable", () => {
    const assigned = /SUPABASE_SERVICE_ROLE[A-Z_]*[ \t]*[=:][ \t]*["']?[A-Za-z0-9._-]{8,}/;
    expect(files().filter((f) => assigned.test(text(f)))).toEqual([]);
  });

  it("no file reads the service-role key from process.env at M0 — A-91's four handlers are M1's", () => {
    const reads = /process\.env\.SUPABASE_SERVICE_ROLE/;
    expect(files().filter((f) => reads.test(text(f)))).toEqual([]);
  });

  it("no NEXT_PUBLIC_ name carries SERVICE or SECRET", () => {
    const leak = /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET)/;
    expect(files().filter((f) => leak.test(text(f)))).toEqual([]);
  });

  it("no file holds a Supabase JWT that names the service_role", () => {
    // A service-role JWT decodes to {"role":"service_role"}; its second segment always starts like this.
    const jwt = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*/;
    expect(files().filter((f) => jwt.test(text(f)))).toEqual([]);
  });
});
