-- M-04 D M1 - structural assertions over the user-administration functions.
-- They read the functions' own source (comments stripped), so a reordering a
-- runtime test cannot see in one session fails here.
--   A-119 (E-01 D finding 51) - every function on A-119's list returns a scalar jsonb.
--   A-129 (E-01 D finding 41) - every function on the list refuses a read-only
--                               transaction before it reads any PIN.
--   M-04 d51                  - a PIN-setting act is refused at the till at the
--                               principal step, before the actor and any PIN.
--   A-89, §5.1, M-04 d13, d28 - the four initials checks and the five PIN-clash
--                               checks run under the Store's assignment lock.
--   A-138                     - one lock order across tables: Owners, the subject,
--                               the Stores, their assignments; checks after the last.
--   M-04 d26                  - the Owner floor is counted after the Owners' lock.
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

-- A-119's list as amended by A-121: the PIN resolution, so every M / O
-- function and manager_authorize_pin, and the four clash-logging functions.
create function pg_temp.a119() returns text[] language sql immutable as $$
  select array['manager_authorize_pin', 'user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign',
               'user_unassign', 'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']
$$;
-- The functions that act on an existing person: all ten but user_add.
create function pg_temp.subjects() returns text[] language sql immutable as $$
  select array['user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign', 'user_unassign',
               'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']
$$;

-- ── Row 11: every function on the list returns a scalar ────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.a119())),
  11, 'A-119 - the list''s eleven functions exist, once each');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.a119())
              and (p.proretset or p.prorettype <> 'jsonb'::regtype)),
  null, 'A-119 - no function on the list returns a set or anything but jsonb (E-01 D finding 51): a returned refusal is one jsonb value');

-- ── Row 12: the read-only guard precedes every PIN read ────────────────────
-- A PIN read is the pepper, the hash table, or the helpers that read either.
create function pg_temp.first_pin_read(p_name text) returns int language sql stable as $$
  select min(x) from unnest(array[pg_temp.at(p_name, 'pin_pepper'), pg_temp.at(p_name, 'user_pins'),
                                  pg_temp.at(p_name, 'app_internal.pin_resolve'), pg_temp.at(p_name, 'app_internal.pin_hash'),
                                  pg_temp.at(p_name, 'app_internal.pin_taken')]) x
   where x > 0
$$;
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where pg_temp.at(f, 'transaction_read_only') = 0
               or pg_temp.first_pin_read(f) is null
               or pg_temp.at(f, 'transaction_read_only') > pg_temp.first_pin_read(f)),
  null, 'A-129 - every function on A-119''s list, manager_authorize_pin included, asserts transaction_read_only before its first PIN read (E-01 D finding 41)');
select ok(pg_temp.at('user_add', 'read_only') > 0 and pg_temp.at('user_add', '25006') > pg_temp.at('user_add', 'transaction_read_only'),
  'A-129 - (the guard raises read_only with 25006)');
-- The header order: tenant, actor, terminal, then the guard (A-103, A-129) —
-- every function on the list with a store-session path.
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where f <> 'user_set_pin'
              and not (pg_temp.at(f, 'no_tenant') > 0
                   and pg_temp.at(f, 'no_tenant') < pg_temp.at(f, 'actor_mismatch')
                   and pg_temp.at(f, 'actor_mismatch') < pg_temp.at(f, 'terminal_mismatch')
                   and pg_temp.at(f, 'terminal_mismatch') < pg_temp.at(f, 'transaction_read_only'))),
  null, 'A-103 - every function on the list with a store-session path asserts tenant, then actor, then terminal, then the read-only guard');
-- user_set_pin has none (M-04 d51): tenant, then the principal, then the actor, then the guard.
select ok(pg_temp.at('user_set_pin', 'no_tenant') > 0
      and pg_temp.at('user_set_pin', 'no_tenant') < pg_temp.at('user_set_pin', 'v_principal is distinct from ''person''')
      and pg_temp.at('user_set_pin', 'v_principal is distinct from ''person''') < pg_temp.at('user_set_pin', 'actor_mismatch')
      and pg_temp.at('user_set_pin', 'actor_mismatch') < pg_temp.at('user_set_pin', 'transaction_read_only')
      and pg_temp.at('user_set_pin', 'terminal_mismatch') = 0
      and pg_temp.at('user_set_pin', 'pin_resolve') = 0,
  'M-04 d51 - user_set_pin refuses every principal but person after the tenant and before the actor, and has no store-session path: no terminal check, no PIN resolution');
-- The three that set a PIN only when given one refuse it at the till at the same step.
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_change_role', 'user_reactivate']) f
            where not (pg_temp.at(f, 'v_principal = ''store'' and p_pin is not null') > pg_temp.at(f, 'no_tenant')
                   and pg_temp.at(f, 'v_principal = ''store'' and p_pin is not null') < pg_temp.at(f, 'actor_mismatch'))),
  null, 'M-04 d51 - user_add, user_change_role and user_reactivate refuse a PIN at the till after the tenant and before the actor, the guard and any PIN');
-- And the PIN resolution, then the Owner question, before the body (A-103, §6).
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_reset_request', 'user_invite_resend']) f
            where not (pg_temp.at(f, 'app_internal.pin_resolve') > pg_temp.at(f, 'transaction_read_only')
                   and pg_temp.at(f, 'detail = ''owner''') > pg_temp.at(f, 'app_internal.pin_resolve'))),
  null, 'A-103 - each O function resolves the PIN, then asks whether that person is an Owner');
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where f not in ('manager_authorize_pin', 'user_set_pin') and pg_temp.at(f, 'app_internal.pin_resolve') = 0),
  null, 'A-119 - every M / O function with a store-session path resolves its PIN through the one helper the suite asserts, app_internal.pin_resolve');
select ok(pg_temp.at('manager_authorize_pin', 'app_internal.pin_resolve') > pg_temp.at('manager_authorize_pin', 'transaction_read_only'),
  'A-119 - and so does manager_authorize_pin: one resolution, one throttle (E-01 d32)');
select ok(pg_temp.at('pin_resolve', 'app_internal.pin_hash') > 0 and pg_temp.at('pin_resolve', 'hmac') = 0,
  'A-89 - pin_resolve compares through app_internal.pin_hash, the one keyed hash, and computes no HMAC of its own (finding 23)');

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

-- ── A-138: one lock order across tables (findings 2, 3, 4) ─────────────────
-- Step 3: every read of the subject's row is the locking read. The only
-- `u.id = p_user_id` in each body is the select ... for no key update.
select is((select array_agg(f order by f) from unnest(pg_temp.subjects()) f
            where pg_temp.times(f, 'u.id = p_user_id') <> 1
               or pg_temp.src(f) !~* 'where\s+u\.id\s*=\s*p_user_id\s+and\s+u\.org_id\s*=\s*v_org_id\s+for\s+no\s+key\s+update'),
  null, 'A-138 - each of the nine functions with a subject reads that person''s row once, and that read takes it FOR NO KEY UPDATE (step 3)');
-- Step 3 precedes every read of what the subject holds and every lock after it.
create function pg_temp.subject_lock(p_name text) returns int language sql stable as $$
  select pg_temp.at(p_name, 'for no key update')
$$;
select is((select array_agg(f order by f) from unnest(pg_temp.subjects()) f
            where pg_temp.subject_lock(f) = 0
               or exists (select 1 from unnest(array[pg_temp.at(f, 'from public.store_assignments a'),
                                                     pg_temp.at(f, 'from public.user_pins'),
                                                     pg_temp.at(f, 'app_internal.lock_store_assignments'),
                                                     pg_temp.at(f, 'app_internal.initials_holder'),
                                                     pg_temp.at(f, 'app_internal.pin_taken'),
                                                     pg_temp.at(f, 'app_internal.active_owner_count')]) x
                           where x > 0 and x < pg_temp.subject_lock(f))),
  null, 'A-138 - the subject''s lock comes before its Store set, its PIN hash, the Stores'' lock and every check (findings 2, 3)');
-- Step 2 before step 3, in the two functions that guard the floor.
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_deactivate']) f
            where not (pg_temp.at(f, 'app_internal.lock_active_owners') > 0
                   and pg_temp.at(f, 'app_internal.lock_active_owners') < pg_temp.subject_lock(f))),
  null, 'A-138 - user_change_role and user_deactivate lock the active Owners (step 2) before the subject (step 3) (finding 4)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_reactivate', 'user_assign', 'user_unassign',
                                                              'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']) f
            where pg_temp.at(f, 'lock_active_owners') > 0),
  null, 'A-138 - no other function takes the Owners'' lock, so none takes it after its subject');

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

-- ── A-139: the helpers are app_internal's, and no session reaches them ─────
create function pg_temp.helpers() returns text[] language sql immutable as $$
  select array['pin_hash', 'pin_resolve', 'lock_active_owners', 'active_owner_count', 'lock_store_assignments',
               'initials_holder', 'pin_taken', 'pin_clash_refused']
$$;
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal'),
  (select array_agg(x order by x) from unnest(pg_temp.helpers()) x),
  'A-139 - app_internal holds the eight helpers the identity functions share');
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = any(pg_temp.helpers())),
  null, 'A-139 - and app holds none of them: §6''s entry points only (finding 18)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_internal'
              and p.proowner::regrole::text = 'waxworks_app'
              and not p.prosecdef
              and p.proconfig @> array['search_path=""']
              and p.proacl is not null
              and not exists (select 1 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and a.grantee = 0)
              and not exists (select 1 from pg_roles r where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin', 'authenticator')
                                                         and has_function_privilege(r.rolname, p.oid, 'execute'))),
  8, 'A-139 - each helper is owned by waxworks_app, runs as its caller, sets search_path to empty, and is executable by no session role and not by public (A-103, A-107)');
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

select * from finish();
rollback;
