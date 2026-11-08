// A-126 — two sessions at once, through PostgREST: the blocker and its waits.
//
// Moved here from m04-race.test.ts (S-01 D M1 row 27) so the S-01 race reuses
// the harness M-04 D repaired rather than a copy of it. Unchanged but for the
// table the blocker locks — `users` (M-04's races) or `organizations` (A-144's
// Organization row, S-01 d12).
//
//   * a third connection (the "blocker", `supabase db query` as postgres) takes
//     one row FOR NO KEY UPDATE, then names itself in pg_stat_activity
//     (application_name), so the test knows the row is held — not guesses;
//   * the requests that must wait are started and seen waiting on a lock;
//   * the blocker commits when the condition it was given holds (both waiting,
//     or a third act committed), and the waiting act then runs to its end.
//
// Finding 39 (a flake: the wait for the blocker timed out once, and the blocker
// was then never awaited): the hold is signalled, not sampled; a blocker that
// ends early fails the wait at once with its output — or, if it ended before
// holding anything, is started again (holding(), below); and whatever happens,
// the blocker is killed and awaited before the test returns.
//
// M-04 D rework pass 4: a request is counted as waiting only in the chain of lock
// waits rooted at this blocker (finding 59); stopping a blocker also ends its
// backend, and only an end seen before the stop is retried (finding 52).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { read, sql, supabaseCommand } from "./harness";

export interface Blocker {
  /** The tag its SQL carries and, once it holds its row, its application_name's suffix. */
  tag: string;
  /** Resolves when the blocker's connection has ended. */
  done: Promise<{ status: number | null; out: string }>;
  /** Whether it has ended, and what it printed so far. */
  ended(): boolean;
  out(): string;
  /** Ends it, if it has not ended, and waits for that; a blocker also ends its backend. */
  stop(): Promise<void>;
}

/** The rows a blocker may hold: a person's (A-138 steps 2, 3) or an Organization's (A-144). */
export type Held = "users" | "organizations";

/**
 * Starts one statement as postgres on its own connection. Finding 52 asked
 * whether, under `shell: true` on Windows, `child.kill()` leaves the CLI and its
 * connection alive. Measured 2026-11-03 (supabase 2.117.0): `kill()` ended both
 * CLI processes and the backend within 1.5 s, while `taskkill /T /F` ended the
 * processes and left the backend sleeping. So `kill()` stays, and a blocker's
 * stop also ends its backend by its tag (below), whichever way the CLI ended.
 */
function background(text: string, tag: string): Blocker {
  const dir = mkdtempSync(join(tmpdir(), "wx-race-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, text, "utf8");
  const c = supabaseCommand(["db", "query", "--local", "-f", file]);
  const child = spawn(c.command, c.args, { shell: c.shell });
  let out = "";
  let ended = false;
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  const done = new Promise<{ status: number | null; out: string }>((resolve) => {
    child.on("close", (status) => {
      ended = true;
      rmSync(dir, { recursive: true, force: true });
      resolve({ status, out });
    });
  });
  return {
    tag,
    done,
    ended: () => ended,
    out: () => out,
    async stop() {
      if (!ended) child.kill();
      await done;
    },
  };
}

/**
 * The blocker: takes `rowId` in `table` FOR NO KEY UPDATE, sets application_name
 * to `wx_race_hold_<tag>` (pg_stat_activity shows it at once), and commits when
 * `release` — a boolean SQL expression — is true.
 */
function blocker(rowId: string, tag: string, release: string, table: Held): Blocker {
  const b = background(`do $wx$ /* wx_race_blocker ${tag} */
declare t0 timestamptz := clock_timestamp();
begin
  perform 1 from public.${table} where id = '${rowId}' for no key update;
  perform pg_catalog.set_config('application_name', 'wx_race_hold_${tag}', false);
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when ${release};
    if clock_timestamp() - t0 > interval '45 seconds' then
      raise exception 'wx_race_blocker_timeout';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end $wx$`, tag);
  return {
    ...b,
    async stop() {
      await b.stop();
      // Whatever ended the CLI, its backend ends too, so nothing queues behind an
      // orphan until the loop's own timeout (finding 52). Keyed on the query text
      // by position, not LIKE, whose `_` is a wildcard (finding 70).
      try {
        sql(`select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity
              where position('wx_race_blocker ${tag} ' in query) > 0 and pid <> pg_catalog.pg_backend_pid()`);
      } catch (e) {
        // Finding 70: stop() runs in a `finally`; a cleanup failure there must not
        // replace the test's own result, so it is reported and not thrown.
        console.log(`race blocker ${tag}: ending its backend failed; the test's own result stands: ${String(e)}`);
      }
    },
  };
}

const count = (where: string) =>
  read<{ n: number }>(`select count(*)::int as n from pg_catalog.pg_stat_activity where ${where}`)[0]!.n;
const blockerHolds = (tag: string) => count(`application_name = 'wx_race_hold_${tag}'`);
/**
 * Requests calling `fn` that wait on a lock behind this blocker — directly, or
 * behind a request that does — so another session calling `fn` on the same stack
 * is never counted (finding 59). `root` is the blocker's pid as SQL: its own
 * `pg_backend_pid()` inside its release check, its application_name from outside.
 */
export const waitingSql = (fn: string, root: string) =>
  `(with recursive chain(pid) as (select ${root}
      union select a.pid from pg_catalog.pg_stat_activity a join chain c on c.pid = any(pg_catalog.pg_blocking_pids(a.pid)))
    select count(*) from pg_catalog.pg_stat_activity a join chain c on c.pid = a.pid
     where a.wait_event_type = 'Lock' and a.query like '%${fn}%')`;
/** The release check's root: the blocker itself. */
export const self = "pg_catalog.pg_backend_pid()";
export const waiting = (fn: string, b: Blocker) =>
  read<{ n: number }>(
    `select ${waitingSql(fn, `(select pid from pg_catalog.pg_stat_activity where application_name = 'wx_race_hold_${b.tag}')`)}::int as n`,
  )[0]!.n;

/** Polls `test` until it holds; fails at once, with the blocker's output, if the blocker has ended. */
export async function until(what: string, b: Blocker, test: () => boolean, ms = 30_000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    if (test()) return;
    if (b.ended()) throw new Error(`the blocker ended while waiting for ${what}: ${b.out()}`);
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}; blocker so far: ${b.out() || "(nothing)"}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Starts the blocker and waits until it holds its row. A blocker whose CLI ends
 * before it signals the hold has held nothing — no request has started — so it
 * is started again, at most twice, and each early end's output is printed.
 * Observed once in eight runs (2026-11-01, finding 39): the CLI process
 * (`supabase.exe` 2.117.0, a compiled wrapper beside `supabase-go.exe`) ended
 * before connecting, printing a JavaScript code frame. Anything after the hold
 * is never retried: there, an early end fails the test with its output. Only an
 * end seen before this side stops it counts as early: a timeout with a live
 * blocker is not retried (finding 52).
 */
export async function holding(rowId: string, tag: string, release: string, table: Held = "users"): Promise<Blocker> {
  for (let attempt = 1; ; attempt++) {
    const t = `${tag}_${attempt}`;
    const b = blocker(rowId, t, release, table);
    try {
      await until(`the blocker to hold its row (attempt ${attempt})`, b, () => blockerHolds(t) === 1);
      return b;
    } catch (e) {
      // Read before stop(), which always ends it. Finding 72: after stop() ends the
      // backend the hold count is always 0, so it is not asked; an end the blocker
      // reached by itself, before the hold was seen, is the early end.
      const early = b.ended();
      await b.stop();
      // Finding 63: say which side failed — the blocker, or this side's wait for it
      // (a poll's own CLI crash is retried inside read(); what reaches here is not).
      console.log(early
        ? `race blocker attempt ${attempt} ended by itself before holding its row: ${String(e)}`
        : `race blocker attempt ${attempt}: the wait for its hold failed while the blocker still ran; not retried: ${String(e)}`);
      if (!early || attempt >= 3) throw e;
    }
  }
}
