// A-126 — Playwright with Chromium's virtual authenticator, on a test-only page
// that loads supabase-js. The page is served by Playwright itself (route
// fulfilment) at http://localhost:3000, the origin config.toml's
// [auth.webauthn] names, so no server runs.
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { local } from "./harness";

const ORIGIN = "http://localhost:3000";

function umd(): string {
  const require = createRequire(import.meta.url);
  const main = require.resolve("@supabase/supabase-js");
  const root = main.slice(0, main.lastIndexOf("supabase-js") + "supabase-js".length);
  return readFileSync(join(root, "dist", "umd", "supabase.js"), "utf8");
}

export interface PasskeyPage {
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}

/** A Chromium page at ORIGIN with a virtual platform authenticator that verifies the user. */
export async function passkeyPage(): Promise<PasskeyPage> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  // A request that fails is printed, so a broken ceremony says where it broke.
  page.on("requestfailed", (r) => console.log(`requestfailed ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("console", (m) => { if (m.type() === "error") console.log(`page console: ${m.text()}`); });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const s = local();
  const script = umd();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    // Auth and PostgREST are reached through the page's own origin and proxied to
    // the local stack: Chromium refused the page access to the loopback address
    // space ("Permission was denied for this request to access the `loopback`
    // address space", observed 2026-10-31), and same-origin calls need no CORS.
    if (path.startsWith("/auth/") || path.startsWith("/rest/")) {
      const response = await route.fetch({ url: `${s.url}${path}${url.search}` });
      await route.fulfill({ response });
      return;
    }
    if (path === "/supabase.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: script });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8"><title>tests/auth</title>
<script src="/supabase.js"></script>
<script>
  window.wx = supabase.createClient(${JSON.stringify(ORIGIN)}, ${JSON.stringify(s.publishableKey)}, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, experimental: { passkey: true } },
  });
</script>`,
    });
  });
  await page.goto(`${ORIGIN}/`);
  return { browser, page, close: () => browser.close() };
}

export interface CeremonyResult {
  registered: { error: string | null };
  signedIn: { error: string | null; access_token: string | null; refresh_token: string | null };
}

/**
 * Takes a link's session into the page, registers a passkey with it, signs out
 * locally, and signs back in with the passkey just made (E-01 d37, steps 9-10).
 */
export async function enrolAndSignIn(page: Page, session: { access_token: string; refresh_token: string }): Promise<CeremonyResult> {
  return page.evaluate(async ({ access_token, refresh_token }) => {
    const wx = (window as unknown as { wx: any }).wx; // eslint-disable-line @typescript-eslint/no-explicit-any
    const set = await wx.auth.setSession({ access_token, refresh_token });
    if (set.error) {
      return { registered: { error: `setSession: ${set.error.message}` }, signedIn: { error: null, access_token: null, refresh_token: null } };
    }
    const reg = await wx.auth.registerPasskey();
    const registered = { error: reg.error ? `${reg.error.name}: ${reg.error.message}` : null };
    await wx.auth.signOut({ scope: "local" });
    const sign = await wx.auth.signInWithPasskey();
    return {
      registered,
      signedIn: {
        error: sign.error ? `${sign.error.name}: ${sign.error.message}` : null,
        access_token: sign.data?.session?.access_token ?? null,
        refresh_token: sign.data?.session?.refresh_token ?? null,
      },
    };
  }, session);
}

/** Signs in with an already-registered passkey on this page. */
export async function passkeySignIn(page: Page): Promise<{ error: string | null; access_token: string | null; refresh_token: string | null }> {
  return page.evaluate(async () => {
    const wx = (window as unknown as { wx: any }).wx; // eslint-disable-line @typescript-eslint/no-explicit-any
    await wx.auth.signOut({ scope: "local" });
    const sign = await wx.auth.signInWithPasskey();
    return {
      error: sign.error ? `${sign.error.name}: ${sign.error.message}` : null,
      access_token: sign.data?.session?.access_token ?? null,
      refresh_token: sign.data?.session?.refresh_token ?? null,
    };
  });
}
