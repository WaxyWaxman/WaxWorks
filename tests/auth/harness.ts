// A-126 — the harness for integration tests against local Supabase Auth.
//
// Everything here talks to the stack `supabase start` runs: Auth's REST endpoints
// for tokens, and `supabase db query --local` for the fixture rows no product
// function can write yet (organization_create, store_create and user_add belong
// to the S-01, O-01 and M-04 orders; the order's row 8 chose fixtures only).
// The keys are read from `supabase status` at run time — they are the
// toolchain's fixed development keys (conventions §2.1), and no key is written
// into this repository.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shell = process.platform === "win32";

function supabase(args: string[]): string {
  const run = spawnSync("supabase", args, { encoding: "utf8", shell, maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed: ${run.stdout} ${run.stderr}`);
  }
  return run.stdout;
}

export interface LocalStack {
  url: string;
  publishableKey: string;
  secretKey: string;
}

let stack: LocalStack | undefined;

/** The running local stack's URL and keys, from `supabase status`. */
export function local(): LocalStack {
  if (stack) return stack;
  const out = supabase(["status", "-o", "json"]);
  const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Record<string, string>;
  const url = json.API_URL;
  const publishableKey = json.PUBLISHABLE_KEY;
  const secretKey = json.SECRET_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("supabase status gave no API_URL or keys: is `supabase start` running?");
  stack = { url, publishableKey, secretKey };
  return stack;
}

/**
 * Runs statements as `postgres` against the local database. `supabase db query`
 * takes one statement, so several are wrapped in one anonymous block.
 */
export function exec(statements: string): void {
  sql(`do $wx$ begin
${statements}
end $wx$`);
}

/**
 * `supabase db query --output-format json` prints one of three things, and which
 * depends on who runs it: a bare array of rows (CI, a plain shell); an object
 * `{boundary, rows, warning}` when the CLI detects an AI agent (`AI_AGENT`,
 * `CLAUDECODE`); or a statement with no result set's command tag (`DO`). Anything
 * else throws: a read that silently came back empty is how `main` went red in CI
 * while every agent-run local pass was green.
 */
export function parseQueryOutput<T>(out: string): T[] {
  const text = out.trim();
  if (/^[A-Z]+( [A-Z]+)*( \d+)*$/.test(text)) return [];
  const json: unknown = JSON.parse(text);
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object" && Array.isArray((json as { rows?: unknown }).rows)) return (json as { rows: T[] }).rows;
  throw new Error(`supabase db query printed neither rows nor a command tag: ${text.slice(0, 200)}`);
}

/** Runs ONE SQL statement as `postgres` against the local database and returns its rows. */
export function sql<T = Record<string, unknown>>(text: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "wx-auth-"));
  const file = join(dir, "q.sql");
  try {
    writeFileSync(file, text, "utf8");
    return parseQueryOutput<T>(supabase(["db", "query", "--local", "--output-format", "json", "-f", file]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface Session {
  access_token: string;
  refresh_token: string;
}

export interface AuthReply {
  status: number;
  body: Record<string, unknown>;
}

async function auth(path: string, init: { method?: string; body?: unknown; key?: "publishable" | "secret"; bearer?: string }): Promise<AuthReply> {
  const s = local();
  const key = init.key === "secret" ? s.secretKey : s.publishableKey;
  const res = await fetch(`${s.url}/auth/v1${path}`, {
    method: init.method ?? "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${init.bearer ?? key}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

/** Auth's admin API, under the secret key (A-91's Server Actions use the same). */
export async function createAuthUser(email: string, password?: string): Promise<string> {
  const r = await auth("/admin/users", { key: "secret", body: { email, password, email_confirm: true } });
  if (r.status >= 300) throw new Error(`create ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id as string;
}

export async function deleteAuthUser(id: string): Promise<void> {
  await auth(`/admin/users/${id}`, { method: "DELETE", key: "secret" });
}

/** A store account's sign-in: email and password (E-01 d24). */
export function passwordSignIn(email: string, password: string): Promise<AuthReply> {
  return auth("/token?grant_type=password", { body: { email, password } });
}

/** A link's session: the admin API mints a magic link, and its token is verified as the page would (A-117). */
export async function linkSession(email: string): Promise<AuthReply> {
  const link = await auth("/admin/generate_link", { key: "secret", body: { type: "magiclink", email } });
  if (link.status >= 300) return link;
  const hashed = (link.body.hashed_token ?? (link.body.properties as Record<string, unknown> | undefined)?.hashed_token) as string;
  return auth("/verify", { body: { type: "magiclink", token_hash: hashed } });
}

export function refresh(refresh_token: string): Promise<AuthReply> {
  return auth("/token?grant_type=refresh_token", { body: { refresh_token } });
}

/** The raw call, for the observation row 35 asks for. */
export function authCall(path: string, init: { method?: string; body?: unknown; key?: "publishable" | "secret"; bearer?: string }): Promise<AuthReply> {
  return auth(path, init);
}

/** A JWT's payload, decoded (no verification: the claims are what is under test). */
export function claims(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/** PostgREST under a token: what the session reaches. */
export async function rest(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; schema?: string; headers?: Record<string, string> } = {},
): Promise<AuthReply & { preferenceApplied: string | null }> {
  const s = local();
  const headers: Record<string, string> = {
    apikey: s.publishableKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...init.headers,
  };
  if (init.schema) {
    headers["Accept-Profile"] = init.schema;
    headers["Content-Profile"] = init.schema;
  }
  const res = await fetch(`${s.url}/rest/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return {
    status: res.status,
    body: (Array.isArray(body) ? { rows: body } : (body as Record<string, unknown>)) ?? {},
    preferenceApplied: res.headers.get("preference-applied"),
  };
}

/** A fresh suffix, so each run's fixture rows and Auth users are its own. */
export const runId = () => randomUUID().slice(0, 8);
