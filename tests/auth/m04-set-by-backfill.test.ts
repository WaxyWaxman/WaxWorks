// M-04 D M1 row 49, finding 45 — M-04 d55's "a PIN set before that record
// existed counts as set by a Manager", asserted of a row that really was present
// when the column arrived.
//
// pgTAP runs after every migration, so it can only read the column's default.
// Here the table migration itself — the committed file, read from disk — is run
// against user_pins as it was before it (the column dropped), with a fixture's
// PIN row already in the table, inside a block that is rolled back: the drop, the
// migration and the read are undone, and only the value read is reported.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runId, sql } from "./harness";
import { makeOrg, type Org } from "./fixtures";

const MIGRATION = "20261101130000_add_set_by_to_user_pins.sql";
const migration = readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url)), "utf8");

let org: Org;

beforeAll(async () => {
  org = await makeOrg(runId(), [{ key: "manager", role: "manager", initials: "MM", stores: ["A"], pin: "4501" }]);
});

afterAll(async () => {
  await org?.cleanup();
});

/**
 * Runs `body` in a sub-block that is always rolled back, and returns the text it
 * hands out as `v`. `supabase db query` takes one statement and the block may not
 * commit, so the value leaves as the message of the block's last exception.
 */
function rolledBack(body: string): string {
  try {
    sql(`do $wx$
declare v text;
begin
  begin
${body}
    raise exception 'wx_rolled_back' using detail = coalesce(v, '(null)');
  exception when others then
    if sqlerrm <> 'wx_rolled_back' then raise; end if;
    get stacked diagnostics v = pg_exception_detail;
  end;
  raise exception 'wx_result=%=', v;
end $wx$`);
  } catch (e) {
    const m = /wx_result=(.*?)=/.exec(String(e));
    if (m) return m[1]!;
    throw e;
  }
  throw new Error("the block ended without reporting its value");
}

describe("M-04 D M1 row 49 — M-04 d55: a PIN present before the set_by column counts as set by a Manager (finding 45)", () => {
  it(`M-04 d55 — ${MIGRATION}, run against user_pins with a row already in it, reads that row as set by a Manager`, () => {
    const user = org.people.manager!.id;
    expect(migration).not.toContain("$wxmig$");
    const before = rolledBack(`
    alter table public.user_pins drop column set_by;            -- user_pins as it was before ${MIGRATION}
    select string_agg(attname, ',' order by attnum) into v from pg_catalog.pg_attribute
     where attrelid = 'public.user_pins'::regclass and attnum > 0 and not attisdropped;`);
    const read = rolledBack(`
    alter table public.user_pins drop column set_by;            -- user_pins as it was before ${MIGRATION}
    if not exists (select 1 from public.user_pins where user_id = '${user}') then
      raise exception 'the fixture''s PIN row is missing';
    end if;
    execute $wxmig$${migration}$wxmig$;                          -- the migration itself, as committed
    select p.set_by into v from public.user_pins p where p.user_id = '${user}';`);
    const after = sql<{ set_by: string }>(`select set_by from public.user_pins where user_id = '${user}'`)[0]?.set_by;
    console.log(`M-04 d55 backfill: columns before the migration ${before}; the present row read after it: ${read}; after the rollback, as stored: ${after}`);
    expect(before.split(",")).not.toContain("set_by");
    expect(read).toBe("manager");
  });
});
