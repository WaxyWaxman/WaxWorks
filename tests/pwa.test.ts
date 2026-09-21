import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("A-1 — online-only in v1; the PWA caches the app shell; writes fail visibly rather than queuing", () => {
  it("a web app manifest exists and the root layout links it", () => {
    expect(existsSync(join(root, "apps/web/public/manifest.webmanifest"))).toBe(true);
    const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(read("apps/web/app/layout.tsx")).toMatch(/manifest/);
  });

  it("the service worker precaches an app-shell list that names no api/ route and no write", () => {
    const sw = read("apps/web/public/sw.js");
    const list = sw.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
    expect(list, "an APP_SHELL array").toBeTruthy();
    const urls = [...list![1]!.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => /\/api\//.test(u) || /^\/?api/.test(u))).toEqual([]);
  });

  it("the service worker registers no background sync and replays no request", () => {
    // Code only — a comment may name the thing it says is absent.
    const sw = read("apps/web/public/sw.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sw).not.toMatch(/addEventListener\(\s*["']sync["']/);
    expect(sw).not.toMatch(/addEventListener\(\s*["']periodicsync["']/);
    expect(sw).not.toMatch(/\.sync\.register\(/);
    expect(sw).not.toMatch(/indexedDB|IDBDatabase|localforage/i);
  });

  it("the fetch handler never serves a non-GET from cache and never caches one", () => {
    const sw = read("apps/web/public/sw.js");
    expect(sw).toMatch(/request\.method\s*!==\s*["']GET["']/);
  });
});
