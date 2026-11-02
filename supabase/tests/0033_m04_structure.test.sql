-- M-04 D M1 - structural assertions over the user-administration functions.
-- They read the functions' own source (comments stripped), so a reordering a
-- runtime test cannot see in one session fails here.
--   A-119 (E-01 D finding 51) - every function on A-119's list returns a scalar jsonb.
--   A-129 (E-01 D finding 41) - every function on the list refuses a read-only
--                               transaction before it reads any PIN.
--   A-103, row 54 (finding 21) - the header the ten share is one app_internal
--                               helper; none of the ten restates it.
--   M-04 d51, d58             - a PIN-setting act, and every Add of a Manager or
--                               Owner, is refused at the till after the tenant and
--                               before the header and any PIN.
--   A-89, §5.1, M-04 d13, d28 - the four initials checks and the five PIN-clash
--                               checks run under the Store's assignment lock.
--   A-138                     - one lock order across tables: Owners, the subject,
--                               the Stores, their assignments; checks after the last.
--                               Every read of the subject's Store set is the one
--                               helper's, after the subject's lock (finding 28).
--   A-140                     - the authoriser is re-checked after the last lock and
--                               before the first write.
--   M-04 d26                  - the Owner floor is counted after the Owners' lock.
--   M-04 d55                  - every write of user_pins records who set it.
--   A-139                     - the helpers live in app_internal, which no session reaches.
--   M-04 d5                   - nothing deletes a User.
--   A-132 (E-01 D finding 46) - auth_user_link locks before its check, for the transaction.
begin;
select no_plan();

-- A function's body, comments stripped: a word in a comment proves nothing.
-- The ten and manager_authorize_pin are app's; the helpers app_internal's (A-139).
create function pg_temp.src(p_name text) returns text language sql stable as $$
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'app_internal') and p.proname = p_name
$$;
-- Where a phrase first appears in a body (0 when it does not).
create function pg_temp.at(p_name text, p_phrase text) returns int language sql stable as $$
  select position(p_phrase in pg_temp.src(p_name))
$$;
-- Where a phrase last appears in a body (0 when it does not).
create function pg_temp.last_at(p_name text, p_phrase text) returns int language sql stable as $$
  select case when position(p_phrase in pg_temp.src(p_name)) = 0 then 0
              else length(pg_temp.src(p_name)) - position(reverse(p_phrase) in reverse(pg_temp.src(p_name))) - length(p_phrase) + 2 end
$$;
-- How many times a phrase appears in a body.
create function pg_temp.times(p_name text, p_phrase text) returns int language sql stable as $$
  select (length(pg_temp.src(p_name)) - length(replace(pg_temp.src(p_name), p_phrase, ''))) / length(p_phrase)
$$;
-- Every call of a function in a body: where it starts, and its argument list
-- (the text up to the first closing parenthesis).
create function pg_temp.calls(p_name text, p_fn text) returns table (pos int, args text) language plpgsql stable as $$
declare v_src text := pg_temp.src(p_name); v_from int := 1; v_at int;
begin
  loop
    v_at := position(p_fn || '(' in substr(v_src, v_from));
    exit when v_at = 0;
    pos := v_from + v_at - 1;
    args := substr(v_src, pos + length(p_fn) + 1, position(')' in substr(v_src, pos + length(p_fn) + 1)) - 1);
    return next;
    v_from := pos + 1;
  end loop;
end
$$;

-- A-119's list as amended by A-121: the PIN resolution, so every M / O
-- function and manager_authorize_pin, and the four clash-logging functions.
create function pg_temp.a119() returns text[] language sql immutable as $$
  select array['manager_authorize_pin', 'user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign',
               'user_unassign', 'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']
$$;
create function pg_temp.ten() returns text[] language sql immutable as $$
  select array_remove(pg_temp.a119(), 'manager_authorize_pin')
$$;
-- The functions that act on an existing person: all ten but user_add.
create function pg_temp.subjects() returns text[] language sql immutable as $$
  select array_remove(pg_temp.ten(), 'user_add')
$$;

-- ── Row 11: every function on the list returns a scalar ────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.a119())),
  11, 'A-119 - the list''s eleven functions exist, once each');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.a119())
              and (p.proretset or p.prorettype <> 'jsonb'::regtype)),
  null, 'A-119 - no function on the list returns a set or anything but jsonb (E-01 D finding 51): a returned refusal is one jsonb value');

-- ── Row 54: the header the ten share is one app_internal helper (finding 21) ──
-- A-103's order, held once: tenant, then principal and actor, then the terminal,
-- then A-129's guard, then the PIN resolution.
select ok(pg_temp.at('header', 'no_tenant') > 0
      and pg_temp.at('header', 'no_tenant') < pg_temp.at('header', 'actor_mismatch')
      and pg_temp.at('header', 'actor_mismatch') < pg_temp.at('header', 'terminal_mismatch')
      and pg_temp.at('header', 'terminal_mismatch') < pg_temp.at('header', 'transaction_read_only')
      and pg_temp.at('header', 'transaction_read_only') < pg_temp.at('header', 'app_internal.pin_resolve'),
  'A-103 - app_internal.header asserts tenant, then actor, then terminal, then the read-only guard, then resolves the PIN');
select ok(pg_temp.at('header', 'read_only') > 0 and pg_temp.at('header', '25006') > pg_temp.at('header', 'transaction_read_only'),
  'A-129 - (the guard raises read_only with 25006)');
-- A-119: the PIN resolution's refusal is passed upward at once, never swallowed.
select ok(pg_temp.src('header') ~* 'v_auth\s*:=\s*app_internal\.pin_resolve\([^;]*\);\s*if\s+v_auth\s*\?\s*''code''\s+then\s+return\s+v_auth;',
  'A-119 - app_internal.header returns pin_resolve''s refusal at once');
-- Each of the ten calls it once, with the M / O header's arguments, and passes a
-- refusal it returns upward at once (A-119).
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.times(f, 'app_internal.header(') <> 1
               or pg_temp.src(f) !~* 'v_h\s*:=\s*app_internal\.header\(p_actor_user_id,\s*p_actor_initials,\s*p_request_id,\s*p_terminal_id,\s*p_manager_pin\);\s*if\s+v_h\s*\?\s*''code''\s+then\s+return\s+v_h;\s*end\s+if;'),
  null, 'A-103 - each of the ten calls app_internal.header once and returns a refusal it gives at once (A-119)');
-- None restates the header: no actor check, no terminal check, no guard and no
-- PIN resolution of its own.
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.at(f, 'actor_mismatch') > 0 or pg_temp.at(f, 'terminal_mismatch') > 0
               or pg_temp.at(f, 'transaction_read_only') > 0 or pg_temp.at(f, 'pin_resolve') > 0
               or pg_temp.at(f, 'authz.user_id()') > 0 or pg_temp.at(f, 'public.terminals') > 0),
  null, 'A-103 - none of the ten restates the actor or terminal check, the guard or the PIN resolution: the header is held once (finding 21)');

-- ── Row 12: the read-only guard precedes every PIN read ────────────────────
-- A PIN read is the pepper, the hash table, or the helpers that read either.
create function pg_temp.first_pin_read(p_name text) returns int language sql stable as $$
  select min(x) from unnest(array[pg_temp.at(p_name, 'pin_pepper'), pg_temp.at(p_name, 'user_pins'),
                                  pg_temp.at(p_name, 'app_internal.pin_resolve'), pg_temp.at(p_name, 'app_internal.pin_hash'),
                                  pg_temp.at(p_name, 'app_internal.pin_taken')]) x
   where x > 0
$$;
-- The guard: transaction_read_only in the body, or the call of app_internal.header,
-- which asserts it before its own first PIN read (the first assertion here).
create function pg_temp.guard_at(p_name text) returns int language sql stable as $$
  select case when pg_temp.at(p_name, 'transaction_read_only') > 0 then pg_temp.at(p_name, 'transaction_read_only')
              else pg_temp.at(p_name, 'app_internal.header(') end
$$;
select ok(pg_temp.at('header', 'transaction_read_only') > 0
      and pg_temp.at('header', 'transaction_read_only') < pg_temp.first_pin_read('header'),
  'A-129 - app_internal.header asserts transaction_read_only before its first PIN read');
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where pg_temp.guard_at(f) = 0
               or pg_temp.guard_at(f) > coalesce(pg_temp.first_pin_read(f), pg_temp.guard_at(f))),
  null, 'A-129 - every function on A-119''s list, manager_authorize_pin included, asserts transaction_read_only — itself or through app_internal.header — before its first PIN read (E-01 D finding 41)');
select ok(pg_temp.at('manager_authorize_pin', 'app_internal.pin_resolve') > pg_temp.at('manager_authorize_pin', 'transaction_read_only'),
  'A-119 - manager_authorize_pin resolves through the same app_internal.pin_resolve: one resolution, one throttle (E-01 d32)');
select ok(pg_temp.at('pin_resolve', 'app_internal.pin_hash') > 0 and pg_temp.at('pin_resolve', 'hmac') = 0,
  'A-89 - pin_resolve compares through app_internal.pin_hash, the one keyed hash, and computes no HMAC of its own (finding 23)');

-- ── Rows 41 and 52: M-04 d51, d58 — refused at the till before the header ──
-- user_set_pin has no store-session path: tenant, then the principal, then the header.
select ok(pg_temp.at('user_set_pin', 'no_tenant') > 0
      and pg_temp.at('user_set_pin', 'no_tenant') < pg_temp.at('user_set_pin', 'v_principal is distinct from ''person''')
      and pg_temp.at('user_set_pin', 'v_principal is distinct from ''person''') < pg_temp.at('user_set_pin', 'app_internal.header('),
  'M-04 d51 - user_set_pin refuses every principal but person after the tenant and before the header (the actor, the terminal, the guard, any PIN)');
-- The three that set a PIN only when given one, and user_add for any role but
-- Employee (M-04 d58), refuse at the till at the same step.
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_change_role', 'user_reactivate']) f
            where not (pg_temp.at(f, 'no_tenant') > 0
                   and pg_temp.at(f, 'detail = ''person''') > pg_temp.at(f, 'no_tenant')
                   and pg_temp.at(f, 'detail = ''person''') < pg_temp.at(f, 'app_internal.header('))),
  null, 'M-04 d51 - user_add, user_change_role and user_reactivate refuse at the till after the tenant and before the header and any PIN');
select ok(pg_temp.src('user_add') ~* 'if\s+v_principal\s*=\s*''store''\s+and\s+\(p_pin\s+is\s+not\s+null\s+or\s+p_role\s+is\s+distinct\s+from\s+''employee''\)\s+then\s+raise\s+exception\s+''role_refused''',
  'M-04 d58 - user_add''s till refusal covers every role but Employee, PIN or not');
-- And the O functions resolve, then ask whether that person is an Owner, before the body.
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_reset_request', 'user_invite_resend']) f
            where not (pg_temp.at(f, 'app_internal.header(') > 0 and pg_temp.at(f, 'detail = ''owner''') > pg_temp.at(f, 'app_internal.header(')
                   and pg_temp.at(f, 'detail = ''owner''') < pg_temp.at(f, 'for no key update'))),
  null, 'A-103 - each O function takes the header, then asks whether that person is an Owner, before its body');

-- ── Rows 17 and 19: the checks run under the Store's assignment lock ───────
select ok(pg_temp.src('lock_store_assignments') ~* 'from\s+public\.stores\s+s.*order\s+by\s+s\.id\s+for\s+no\s+key\s+update.*from\s+public\.store_assignments\s+a.*order\s+by\s+a\.org_id,\s*a\.user_id,\s*a\.store_id\s+for\s+update',
  'A-138 - app_internal.lock_store_assignments takes the Stores'' rows FOR NO KEY UPDATE in id order, then their assignment rows FOR UPDATE in key order (A-38)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_assign', 'user_reactivate', 'user_correct']) f
            where not (pg_temp.at(f, 'app_internal.lock_store_assignments') > 0
                   and pg_temp.at(f, 'app_internal.lock_store_assignments') < pg_temp.at(f, 'initials_clash'))),
  null, 'M-04 d13 - user_add, user_assign, user_reactivate and user_correct each take the assignment lock before the initials check (§5.1)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_assign', 'user_reactivate', 'user_set_pin', 'user_change_role']) f
            where not (pg_temp.at(f, 'app_internal.lock_store_assignments') > 0
                   and pg_temp.at(f, 'app_internal.lock_store_assignments') < pg_temp.at(f, 'app_internal.pin_taken'))),
  null, 'M-04 d28 - user_set_pin, user_assign, user_change_role, user_reactivate and user_add each take the same lock before the PIN-clash check');

-- ── Row 47: A-138, one lock order across tables (findings 2, 3, 4, 28) ─────
-- Each lock is one statement, taken once: no other row lock in any of the ten.
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.times(f, 'app_internal.lock_store_assignments') > 1
               or pg_temp.times(f, 'app_internal.lock_active_owners') > 1
               or (select count(*) from regexp_matches(pg_temp.src(f), 'for\s+(no\s+key\s+update|update|key\s+share|share)', 'gi'))
                  <> pg_temp.times(f, 'for no key update')
               or pg_temp.times(f, 'for no key update') <> case when f = 'user_add' then 0 else 1 end),
  null, 'A-138 - each of the ten takes each lock in one statement, once: the subject''s FOR NO KEY UPDATE and no other row lock of its own');
-- Step 3: every read of the subject's row is the locking read. The only
-- `u.id = p_user_id` in each body is the select ... for no key update.
select is((select array_agg(f order by f) from unnest(pg_temp.subjects()) f
            where pg_temp.times(f, 'u.id = p_user_id') <> 1
               or pg_temp.src(f) !~* 'where\s+u\.id\s*=\s*p_user_id\s+and\s+u\.org_id\s*=\s*v_org_id\s+for\s+no\s+key\s+update'),
  null, 'A-138 - each of the nine functions with a subject reads that person''s row once, and that read takes it FOR NO KEY UPDATE (step 3)');
-- Finding 28: no body reads store_assignments itself, under any alias — every
-- read of a Store set is app_internal.store_set's, so one assertion catches them.
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.times(f, 'public.store_assignments')
                  <> pg_temp.times(f, 'insert into public.store_assignments') + pg_temp.times(f, 'delete from public.store_assignments')),
  null, 'A-138 - none of the ten reads store_assignments itself: every Store set is read through app_internal.store_set (finding 28)');
select ok(pg_temp.src('store_set') ~* 'from\s+public\.store_assignments\s+\w+\s+where\s+\w+\.org_id\s*=\s*p_org_id\s+and\s+\w+\.user_id\s*=\s*p_user_id'
      and pg_temp.src('store_set') !~* 'for\s+(no\s+key\s+)?update',
  'A-138 - app_internal.store_set reads one person''s Stores in their Organization, and locks nothing');
-- Step 3 precedes every read of what the subject holds and every lock after it:
-- each read of a Store set but the authoriser's, the PIN hash, the Stores' lock and every check.
create function pg_temp.subject_lock(p_name text) returns int language sql stable as $$
  select pg_temp.at(p_name, 'for no key update')
$$;
select is((select array_agg(f order by f) from unnest(pg_temp.subjects()) f
            where pg_temp.subject_lock(f) = 0
               or exists (select 1 from pg_temp.calls(f, 'app_internal.store_set') c
                           where c.args !~ 'v_by_id' and c.pos < pg_temp.subject_lock(f))
               or exists (select 1 from unnest(array[pg_temp.at(f, 'public.user_pins'),
                                                     pg_temp.at(f, 'app_internal.lock_store_assignments'),
                                                     pg_temp.at(f, 'app_internal.initials_holder'),
                                                     pg_temp.at(f, 'app_internal.pin_taken'),
                                                     pg_temp.at(f, 'app_internal.active_owner_count'),
                                                     pg_temp.at(f, 'app_internal.authoriser_recheck')]) x
                           where x > 0 and x < pg_temp.subject_lock(f))),
  null, 'A-138 - the subject''s lock comes before its Store set (whatever reads it), its PIN hash, the Stores'' lock and every check (findings 2, 3, 28)');
-- Step 2 before step 3, in the two functions that guard the floor.
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_deactivate']) f
            where not (pg_temp.at(f, 'app_internal.lock_active_owners') > 0
                   and pg_temp.at(f, 'app_internal.lock_active_owners') < pg_temp.subject_lock(f))),
  null, 'A-138 - user_change_role and user_deactivate lock the active Owners (step 2) before the subject (step 3) (finding 4)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_reactivate', 'user_assign', 'user_unassign',
                                                              'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']) f
            where pg_temp.at(f, 'lock_active_owners') > 0),
  null, 'A-138 - no other function takes the Owners'' lock, so none takes it after its subject');
-- Steps 4 and 5 after step 3 where both are taken (the subject's Store set decides them).
select is((select array_agg(f order by f) from unnest(pg_temp.subjects()) f
            where pg_temp.at(f, 'app_internal.lock_store_assignments') > 0
              and pg_temp.at(f, 'app_internal.lock_store_assignments') < pg_temp.subject_lock(f)),
  null, 'A-138 - the Stores'' lock (steps 4, 5) never comes before the subject''s (step 3)');

-- ── Row 53: A-140 — the authoriser re-checked after the last lock ──────────
-- Where each function's last lock is, and where it first writes.
create function pg_temp.last_lock(p_name text) returns int language sql stable as $$
  select greatest(pg_temp.last_at(p_name, 'for no key update'), pg_temp.last_at(p_name, 'app_internal.lock_store_assignments'),
                  pg_temp.last_at(p_name, 'app_internal.lock_active_owners'))
$$;
create function pg_temp.first_write(p_name text) returns int language sql stable as $$
  select min(x) from unnest(array[pg_temp.at(p_name, 'insert into public.'), pg_temp.at(p_name, 'update public.'),
                                  pg_temp.at(p_name, 'delete from public.'), pg_temp.at(p_name, 'app_internal.pin_clash_refused')]) x
   where x > 0
$$;
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.times(f, 'app_internal.authoriser_recheck(') <> 1
               or pg_temp.at(f, 'app_internal.authoriser_recheck(') < pg_temp.last_lock(f)
               or pg_temp.at(f, 'app_internal.authoriser_recheck(') > pg_temp.first_write(f)),
  null, 'A-140 - in each of the ten the authoriser is re-checked once, after its last lock and before its first write');
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where coalesce((select c.args from pg_temp.calls(f, 'app_internal.authoriser_recheck') c limit 1), '') !~ '^\s*v_org_id,\s*v_by_id,'),
  null, 'A-140 - each re-checks the authoriser it resolved in its header (v_by_id), in its own Organization');
-- In the two that guard the floor, after the floor: the race of row 47 is refused
-- owner_floor, the race of row 53 role_refused.
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_deactivate']) f
            where not (pg_temp.at(f, 'owner_floor') > 0 and pg_temp.at(f, 'owner_floor') < pg_temp.at(f, 'app_internal.authoriser_recheck('))),
  null, 'A-140 - user_change_role and user_deactivate re-check the authoriser after the Owner floor is counted');
select ok(pg_temp.src('authoriser_recheck') ~* 'from\s+public\.users\s+u\s+where\s+u\.id\s*=\s*p_by_id\s+and\s+u\.org_id\s*=\s*p_org_id'
      and pg_temp.src('authoriser_recheck') ~* 'role_refused'
      and pg_temp.src('authoriser_recheck') ~* 'app_internal\.store_set\(p_org_id,\s*p_by_id\)'
      and pg_temp.src('authoriser_recheck') !~* 'for\s+(no\s+key\s+)?update|for\s+(key\s+)?share',
  'A-140 - app_internal.authoriser_recheck re-reads the authoriser''s row and Stores, takes no lock, and refuses role_refused');

-- ── Row 23: the Owner floor is counted after the Owners' lock ──────────────
select ok(pg_temp.src('lock_active_owners') ~* 'role\s*=\s*''owner'''
      and pg_temp.src('lock_active_owners') ~* 'order\s+by\s+u\.id'
      and pg_temp.src('lock_active_owners') ~* 'for\s+no\s+key\s+update'
      and pg_temp.src('lock_active_owners') !~* 'count\(',
  'A-138 - app_internal.lock_active_owners takes the Organization''s active Owner rows FOR NO KEY UPDATE in key order, and counts nothing');
select ok(pg_temp.src('active_owner_count') ~* 'count\(' and pg_temp.src('active_owner_count') !~* 'for\s+(no\s+key\s+)?update',
  'M-04 d26 - app_internal.active_owner_count counts and locks nothing: the caller''s lock is what makes the count hold');
-- Finding 9: each of the two counts once, through the helper only, after the
-- Owners' lock and after its last other lock — an unlocked count placed first,
-- inline or through the helper, fails one of the four.
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_deactivate']) f
            where not (pg_temp.times(f, 'app_internal.active_owner_count') = 1
                   and pg_temp.src(f) !~* '\mcount\s*\('
                   and pg_temp.at(f, 'app_internal.active_owner_count') > pg_temp.at(f, 'app_internal.lock_active_owners')
                   and pg_temp.at(f, 'app_internal.active_owner_count') > pg_temp.subject_lock(f)
                   and pg_temp.at(f, 'app_internal.active_owner_count') > pg_temp.last_at(f, 'app_internal.lock_store_assignments')
                   and pg_temp.at(f, 'app_internal.active_owner_count') < pg_temp.at(f, 'owner_floor'))),
  null, 'M-04 d26 - user_change_role and user_deactivate count the active Owners once, through the helper, after every lock they take and before owner_floor (§5.1, A-138; finding 9)');

-- ── Row 49: M-04 d55 — every write of user_pins names its setter ───────────
select is((select array_agg(f order by f) from unnest(pg_temp.ten()) f
            where pg_temp.times(f, 'insert into public.user_pins') + pg_temp.times(f, 'update public.user_pins')
                  <> pg_temp.times(f, 'app_internal.pin_setter(')),
  null, 'M-04 d55 - every insert or update of user_pins in the ten records who set it, through app_internal.pin_setter');
select ok(pg_temp.src('pin_setter') ~* '''holder''' and pg_temp.src('pin_setter') ~* '''owner''' and pg_temp.src('pin_setter') ~* '''manager''',
  'M-04 d55 - app_internal.pin_setter names the holder, an Owner or a Manager');
-- (Its values are asserted by calling it, at the end of this file.)

-- ── A-139: the helpers are app_internal's, and no session reaches them ─────
create function pg_temp.helpers() returns text[] language sql immutable as $$
  select array['pin_hash', 'pin_resolve', 'lock_active_owners', 'active_owner_count', 'lock_store_assignments',
               'initials_holder', 'pin_taken', 'pin_clash_refused', 'header', 'authoriser_recheck', 'store_set', 'pin_setter']
$$;
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal'),
  (select array_agg(x order by x) from unnest(pg_temp.helpers()) x),
  'A-139 - app_internal holds the helpers the identity functions share, the header (row 54) and the re-check (A-140) among them');
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.helpers())),
  null, 'A-139 - and app holds none of them: §6''s entry points only (finding 18)');
-- Finding 33: every function there, not a counted eight.
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal'
              and not (p.proowner::regrole::text = 'waxworks_app'
                       and not p.prosecdef
                       and p.proconfig @> array['search_path=""']
                       and p.proacl is not null
                       and not exists (select 1 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and a.grantee = 0)
                       and not exists (select 1 from pg_roles r where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin', 'authenticator')
                                                                  and has_function_privilege(r.rolname, p.oid, 'execute')))),
  null, 'A-139 - every function in app_internal is owned by waxworks_app, runs as its caller, sets search_path to empty, and is executable by no session role and not by public (A-103, A-107; finding 33)');
select is((select array_agg(r.rolname::text order by r.rolname) from pg_roles r
            where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin', 'authenticator')
              and has_schema_privilege(r.rolname, 'app_internal', 'usage')),
  null, 'A-139 - no session role, nor PostgREST''s authenticator, holds usage on app_internal');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app_internal' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')),
  0, 'A-139 - app_internal holds functions only (A-105''s rule for app)');
select is((select nspowner::regrole::text from pg_namespace where nspname = 'app_internal'), 'waxworks_app',
  'A-139 - app_internal is owned by waxworks_app, so A-104''s set role opener creates in it');
-- §6's entry points, as its Identity row names them today. A later order adding
-- an app function of another domain adds its §6 name here.
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app'
              and p.proname <> all (array['terminal_register', 'actor_resolve', 'manager_authorize_pin', 'session_select_store',
                                          'user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign',
                                          'user_unassign', 'user_correct', 'user_set_pin', 'user_reset_request',
                                          'user_invite_resend', 'store_create', 'store_account_reset', 'auth_user_link',
                                          'organization_create', 'owner_recover', 'owner_reset_request'])),
  null, 'A-139 - no function in app outside §6''s list: app holds the entry points only');

-- ── Row 46: A-137 — delete on store_assignments and user_pins, and no other identity table ──
-- Every table in public is an identity table at M1.
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('waxworks_app', c.oid, 'delete')),
  array['store_assignments', 'user_pins'],
  'A-137 - waxworks_app holds delete on store_assignments and user_pins, and on no other identity table');
select is((select array_agg(distinct r.rolname::text) from pg_roles r, pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
              and r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin')
              and has_table_privilege(r.rolname, c.oid, 'delete')),
  null, 'A-137 - no client role holds delete on any identity table: the grant is the owner''s ceiling only');

-- ── Row 32: M-04 d5 — Users are deactivated, never deleted ─────────────────
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('app', 'app_internal', 'authz') and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~* 'delete\s+from\s+public\.users\M'),
  null, 'M-04 d5 - no function in app, app_internal or authz deletes from users');
select is((select count(*)::int from pg_roles r
            where r.rolname in ('waxworks_app', 'authenticated', 'anon', 'service_role', 'sysadmin')
              and has_table_privilege(r.rolname, 'public.users', 'delete')),
  0, 'M-04 d5 - nobody holds delete on users: not a client, not the service role, not the owner''s ceiling (A-104)');

-- ── Row 38: A-132 — auth_user_link's lock, before its check, for the transaction ──
create function pg_temp.def(p regproc) returns text language sql stable as $$
  select regexp_replace(pg_get_functiondef(p), '--[^\n]*', '', 'g')
$$;
select ok(position('pg_advisory_xact_lock' in pg_temp.def('app.auth_user_link'::regproc)) > 0
      and position('pg_advisory_xact_lock' in pg_temp.def('app.auth_user_link'::regproc))
        < position('auth_user_in_use' in pg_temp.def('app.auth_user_link'::regproc)),
  'A-132 - auth_user_link takes pg_advisory_xact_lock before its auth_user_in_use check (E-01 D finding 46)');
select ok(pg_temp.def('app.auth_user_link'::regproc) !~* 'pg_advisory_lock\s*\(',
  'A-132 - and no session-scoped pg_advisory_lock appears: the lock ends with the transaction');

-- ── Row 49: M-04 d55 — app_internal.pin_setter's values (last: it is called) ──
select is(array[app_internal.pin_setter('00000000-0000-0000-0000-000000000001', 'owner', '00000000-0000-0000-0000-000000000001'),
                app_internal.pin_setter('00000000-0000-0000-0000-000000000001', 'manager', '00000000-0000-0000-0000-000000000001'),
                app_internal.pin_setter('00000000-0000-0000-0000-000000000001', 'owner', '00000000-0000-0000-0000-000000000002'),
                app_internal.pin_setter('00000000-0000-0000-0000-000000000001', 'manager', '00000000-0000-0000-0000-000000000002')],
  array['holder', 'holder', 'owner', 'manager'],
  'M-04 d55 - the holder setting their own is the holder, whatever their role; otherwise the setter''s role');

select * from finish();
rollback;
