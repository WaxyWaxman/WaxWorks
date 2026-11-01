-- M-04 D M1 - structural assertions over the user-administration functions.
-- They read the functions' own source (comments stripped), so a reordering a
-- runtime test cannot see in one session fails here.
--   A-119 (E-01 D finding 51) - every function on A-119's list returns a scalar jsonb.
--   A-129 (E-01 D finding 41) - every function on the list refuses a read-only
--                               transaction before it reads any PIN.
--   A-89, §5.1, M-04 d13, d28 - the four initials checks and the five PIN-clash
--                               checks run under the Store's assignment lock.
--   M-04 d26                  - the Owner floor is counted under the Owners' lock.
--   M-04 d5                   - nothing deletes a User.
--   A-132 (E-01 D finding 46) - auth_user_link locks before its check, for the transaction.
begin;
select no_plan();

-- A function's body, comments stripped: a word in a comment proves nothing.
create function pg_temp.src(p_name text) returns text language sql stable as $$
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = p_name
$$;
-- Where a phrase first appears in a body (0 when it does not).
create function pg_temp.at(p_name text, p_phrase text) returns int language sql stable as $$
  select position(p_phrase in pg_temp.src(p_name))
$$;

-- A-119's list as amended by A-121: the PIN resolution, so every M / O
-- function and manager_authorize_pin, and the four clash-logging functions.
create function pg_temp.a119() returns text[] language sql immutable as $$
  select array['manager_authorize_pin', 'user_add', 'user_change_role', 'user_deactivate', 'user_reactivate', 'user_assign',
               'user_unassign', 'user_correct', 'user_set_pin', 'user_reset_request', 'user_invite_resend']
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
                                  pg_temp.at(p_name, 'app.pin_resolve'), pg_temp.at(p_name, 'app.pin_hash'),
                                  pg_temp.at(p_name, 'app.pin_taken')]) x
   where x > 0
$$;
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where pg_temp.at(f, 'transaction_read_only') = 0
               or pg_temp.first_pin_read(f) is null
               or pg_temp.at(f, 'transaction_read_only') > pg_temp.first_pin_read(f)),
  null, 'A-129 - every function on A-119''s list, manager_authorize_pin included, asserts transaction_read_only before its first PIN read (E-01 D finding 41)');
select ok(pg_temp.at('user_add', 'read_only') > 0 and pg_temp.at('user_add', '25006') > pg_temp.at('user_add', 'transaction_read_only'),
  'A-129 - (the guard raises read_only with 25006)');
-- The header order: tenant, actor, terminal, then the guard (A-103, A-129).
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where not (pg_temp.at(f, 'no_tenant') > 0
                   and pg_temp.at(f, 'no_tenant') < pg_temp.at(f, 'actor_mismatch')
                   and pg_temp.at(f, 'actor_mismatch') < pg_temp.at(f, 'terminal_mismatch')
                   and pg_temp.at(f, 'terminal_mismatch') < pg_temp.at(f, 'transaction_read_only'))),
  null, 'A-103 - every function on the list asserts tenant, then actor, then terminal, then the read-only guard');
-- And the PIN resolution, then the Owner question, before the body (A-103, §6).
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_reset_request', 'user_invite_resend']) f
            where not (pg_temp.at(f, 'app.pin_resolve') > pg_temp.at(f, 'transaction_read_only')
                   and pg_temp.at(f, 'detail = ''owner''') > pg_temp.at(f, 'app.pin_resolve'))),
  null, 'A-103 - each O function resolves the PIN, then asks whether that person is an Owner');
select is((select array_agg(f order by f) from unnest(pg_temp.a119()) f
            where f <> 'manager_authorize_pin' and pg_temp.at(f, 'app.pin_resolve') = 0),
  null, 'A-119 - every M / O function resolves its PIN through the one helper the suite asserts, app.pin_resolve');
select ok(pg_temp.at('manager_authorize_pin', 'app.pin_resolve') > pg_temp.at('manager_authorize_pin', 'transaction_read_only'),
  'A-119 - and so does manager_authorize_pin: one resolution, one throttle (E-01 d32)');

-- ── Rows 17 and 19: the checks run under the Store's assignment lock ───────
select ok(pg_temp.src('lock_store_assignments') ~* 'from\s+public\.store_assignments'
      and pg_temp.src('lock_store_assignments') ~* 'order\s+by\s+a\.org_id,\s*a\.user_id,\s*a\.store_id'
      and pg_temp.src('lock_store_assignments') ~* 'for\s+update',
  'A-89 - app.lock_store_assignments takes the Stores'' assignment rows FOR UPDATE in key order (A-38)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_assign', 'user_reactivate', 'user_correct']) f
            where not (pg_temp.at(f, 'app.lock_store_assignments') > 0
                   and pg_temp.at(f, 'app.lock_store_assignments') < pg_temp.at(f, 'initials_clash'))),
  null, 'M-04 d13 - user_add, user_assign, user_reactivate and user_correct each take the assignment lock before the initials check (§5.1)');
select is((select array_agg(f order by f) from unnest(array['user_add', 'user_assign', 'user_reactivate', 'user_set_pin', 'user_change_role']) f
            where not (pg_temp.at(f, 'app.lock_store_assignments') > 0
                   and pg_temp.at(f, 'app.lock_store_assignments') < pg_temp.at(f, 'app.pin_taken'))),
  null, 'M-04 d28 - user_set_pin, user_assign, user_change_role, user_reactivate and user_add each take the same lock before the PIN-clash check');

-- ── Row 23: the Owner floor is counted under the Owners' lock ──────────────
select ok(pg_temp.src('lock_active_owners') ~* 'role\s*=\s*''owner'''
      and pg_temp.src('lock_active_owners') ~* 'order\s+by\s+u\.id'
      and pg_temp.src('lock_active_owners') ~* 'for\s+update'
      and pg_temp.src('lock_active_owners') ~* 'count\(',
  'M-04 d26 - app.lock_active_owners takes the Organization''s active Owner rows FOR UPDATE in key order, then counts');
select is((select array_agg(f order by f) from unnest(array['user_change_role', 'user_deactivate']) f
            where not (pg_temp.at(f, 'app.lock_active_owners') > 0
                   and pg_temp.at(f, 'app.lock_active_owners') < pg_temp.at(f, 'owner_floor'))),
  null, 'M-04 d26 - user_change_role and user_deactivate lock the active Owners before the floor is counted (§5.1)');

-- The internal helpers are nobody's to call but the definer functions'.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app'
              and p.proname in ('pin_resolve', 'pin_hash', 'pin_taken', 'initials_holder', 'lock_store_assignments', 'lock_active_owners')
              and p.proowner::regrole::text = 'waxworks_app'
              and not exists (select 1 from pg_roles r where r.rolname in ('authenticated', 'anon', 'service_role', 'sysadmin')
                                                         and has_function_privilege(r.rolname, p.oid, 'execute'))),
  6, 'A-107 - the six internal helpers are owned by waxworks_app and executable by no session role');

-- ── Row 32: M-04 d5 — Users are deactivated, never deleted ─────────────────
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('app', 'authz') and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~* 'delete\s+from\s+public\.users\M'),
  null, 'M-04 d5 - no function in app or authz deletes from users');
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
