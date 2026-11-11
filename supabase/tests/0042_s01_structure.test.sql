-- S-01 D M1 - structural assertions over the three S functions, read from their
-- own source (comments stripped), in 0033's shape: an order a runtime test in
-- one session cannot see fails here. Rows 4, 13, 14, 22 and 23 of the order.
--   A-113          - principal, then actor, then the active row, before anything else.
--   A-119, A-129   - neither binds: no returned refusal, no read-only guard.
--   A-114, A-104   - no Auth table is touched.
--   A-138, A-144   - owner_recover: the Organization's row, the Owners' lock, the count, active_owner,
--                    the subjects, the restored Owner's Stores; owner_reset_request: the Organization's
--                    row, then the subject, before any write; organization_create none (pass 2: S-01 d10-d12).
--   A-140, A-141   - the System Administrator re-read after the last lock, after the
--                    act's own refusals, before the first write.
begin;
select no_plan();

create function pg_temp.src(p_name text) returns text language sql stable as $$
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = p_name
$$;
create function pg_temp.at(p_name text, p_phrase text) returns int language sql stable as $$
  select position(p_phrase in pg_temp.src(p_name))
$$;
create function pg_temp.last_at(p_name text, p_phrase text) returns int language sql stable as $$
  select case when position(p_phrase in pg_temp.src(p_name)) = 0 then 0
              else length(pg_temp.src(p_name)) - position(reverse(p_phrase) in reverse(pg_temp.src(p_name))) - length(p_phrase) + 2 end
$$;
create function pg_temp.times(p_name text, p_phrase text) returns int language sql stable as $$
  select (length(pg_temp.src(p_name)) - length(replace(pg_temp.src(p_name), p_phrase, ''))) / length(p_phrase)
$$;
-- Where the first write is: an insert into or update of a product table.
create function pg_temp.first_write(p_name text) returns int language sql stable as $$
  select min(x) from (select nullif(pg_temp.at(p_name, w), 0) x
                        from unnest(array['insert into public.', 'update public.', 'delete from public.']) w) y
$$;
create function pg_temp.three() returns text[] language sql immutable as $$
  select array['organization_create', 'owner_recover', 'owner_reset_request']
$$;

select is((select count(*)::int from unnest(pg_temp.three()) f where pg_temp.src(f) is not null), 3,
  'A-113 - the three S functions exist in app');

-- ── Row 4: A-113 — the S header, first, in the fake's order ───────────────
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where not (pg_temp.at(f, 'authz.principal()') > 0
                       and pg_temp.at(f, 'authz.principal()') < pg_temp.at(f, 'actor_mismatch')
                       and pg_temp.at(f, 'actor_mismatch') < pg_temp.at(f, 'public.system_administrators'))),
  null, 'A-113 - each asserts the principal, then the actor against the JWT subject, then the active system_administrators row (fake/identity.ts:137-143)');
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.at(f, 'public.system_administrators') > least(
                    coalesce(nullif(pg_temp.at(f, 'public.organizations'), 0), 1000000),
                    coalesce(nullif(pg_temp.at(f, 'public.users'), 0), 1000000),
                    coalesce(nullif(pg_temp.at(f, 'invalid_input'), 0), 1000000))),
  null, 'A-113 - the header comes before the body reads any Organization or person, or checks any argument');
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.src(f) ~* '(no_tenant|authz\.org_id\(\)|app_internal\.header\()'),
  null, 'A-113 - none asserts a tenant or calls app_internal.header, whose first assertion is a tenant they do not have');
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.src(f) !~* '''sub''' ),
  null, 'A-113 - each compares p_actor_user_id with the JWT''s sub, auth.uid()''s source (waxworks_app holds no usage on auth)');

-- ── Row 13: A-119, A-129 — neither binds ───────────────────────────────────
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.src(f) ~* '(response\.status|transaction_read_only)'),
  null, 'A-119, A-129 - none of the three sets response.status or reads transaction_read_only: every S refusal is raised and recorded nowhere');
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.src(f) ~* 'return\s+jsonb_build_object\(\s*''code'''),
  null, 'A-119 - none returns a refusal body: it raises');

-- ── Row 14: A-114, A-104 — no Auth table ───────────────────────────────────
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where pg_temp.src(f) ~* '\mauth\.'),
  null, 'A-114, A-104 - none references a table or function in schema auth: the Auth call is the Server Action''s (A-91)');

-- ── Row 22: A-138 — the lock order ─────────────────────────────────────────
select ok(pg_temp.at('owner_recover', 'app_internal.lock_active_owners(') > 0
          and pg_temp.at('owner_recover', 'app_internal.lock_active_owners(') < pg_temp.at('owner_recover', 'app_internal.active_owner_count(')
          and pg_temp.at('owner_recover', 'app_internal.active_owner_count(') < pg_temp.at('owner_recover', '''active_owner'''),
  'A-138 - owner_recover takes the Owners'' lock (step 2), then counts under it, then refuses active_owner');
select ok(pg_temp.src('owner_recover') ~* 'from public\.users u\s+where u\.org_id = p_org_id and u\.id in \(p_replace_user_id, p_user_id\)\s+order by u\.id\s+for no key update' and pg_temp.at('owner_recover', 'order by u.id') > pg_temp.at('owner_recover', '''active_owner''') and pg_temp.at('owner_recover', 'order by u.id') > pg_temp.at('owner_recover', 'for no key update') and pg_temp.at('owner_recover', 'for no key update') < pg_temp.at('owner_recover', 'app_internal.lock_active_owners(')
          and regexp_instr(pg_temp.src('owner_recover'), '"?public"?\s*\.\s*"?users\M', 1, 2) > pg_temp.at('owner_recover', 'order by u.id') and regexp_instr(pg_temp.src('owner_recover'), '"?public"?\s*\.\s*"?users\M') between pg_temp.at('owner_recover', 'app_internal.lock_active_owners(') and pg_temp.at('owner_recover', 'order by u.id')
          and pg_temp.at('owner_recover', 'from public.user_pins') > pg_temp.at('owner_recover', 'order by u.id') and pg_temp.at('owner_recover', 'app_internal.store_set(') > pg_temp.at('owner_recover', 'order by u.id') and pg_temp.at('owner_recover', 'order by u.id') < pg_temp.at('owner_recover', '''inactive'''),
  'A-138, A-146 - owner_recover locks both subjects (step 3) in one statement, in id order, after the Organization''s row and active_owner; every read of a subject''s row, its PIN hash and its Store set comes after that statement by position (S-01 D M1 finding 17), whatever its text: the first reference to public.users is the step-3 statement and every other comes after it (finding 41)');
select ok(pg_temp.times('owner_reset_request', 'for no key update') = 2
          and pg_temp.src('owner_reset_request') ~* 'select[^;]*from public\.users u[^;]*p_user_id[^;]*for no key update'
          and pg_temp.last_at('owner_reset_request', 'for no key update') < pg_temp.first_write('owner_reset_request')
          and pg_temp.at('owner_reset_request', 'lock_active_owners') = 0,
  'A-138 - owner_reset_request takes step 3 after the Organization''s row: the subject read under its lock, before any write');
select ok(pg_temp.src('organization_create') !~* '(for\s+(no\s+key\s+)?update|for\s+(key\s+)?share|lock_active_owners|lock_store_assignments)',
  'A-138 - organization_create takes no lock: the Organization does not exist before its insert');
select is((select array_agg(f order by f) from unnest(array['owner_recover', 'owner_reset_request']) f
            where not (pg_temp.src(f) ~* 'from\s+public\.organizations\s+o\s+where\s+o\.id\s*=\s*p_org_id\s+for\s+no\s+key\s+update' and pg_temp.at(f, 'for no key update') < least(coalesce(nullif(pg_temp.at(f, 'app_internal.lock_active_owners('), 0), 1000000), pg_temp.last_at(f, 'for no key update')))),
  null, 'A-144, S-01 d12 - owner_recover and owner_reset_request lock the Organization''s row (for no key update) after the header and before the Owner rows and the subject (0042:90-92 inverted)');

-- ── Row 23: A-140, A-141 — the re-check ────────────────────────────────────
select is(pg_temp.times('organization_create', 'public.system_administrators'), 1,
  'A-140 - organization_create reads the System Administrator once: it takes no lock, so its header read is its re-check');
select is((select array_agg(f order by f) from unnest(array['owner_recover', 'owner_reset_request']) f
            where pg_temp.times(f, 'public.system_administrators') <> 2),
  null, 'A-140 - owner_recover and owner_reset_request read the System Administrator''s row twice: the header, and the re-check');
select ok(pg_temp.last_at('owner_recover', 'public.system_administrators') > pg_temp.last_at('owner_recover', 'for no key update')
          and pg_temp.last_at('owner_recover', 'public.system_administrators') > pg_temp.at('owner_recover', 'app_internal.lock_active_owners(')
          and pg_temp.last_at('owner_recover', 'public.system_administrators') > pg_temp.last_at('owner_recover', '''active_owner''')
          and pg_temp.last_at('owner_recover', 'public.system_administrators') > pg_temp.last_at('owner_recover', '''not_found''')
          and pg_temp.last_at('owner_recover', 'public.system_administrators') < pg_temp.first_write('owner_recover'),
  'A-140, A-141 - owner_recover re-reads the System Administrator after its last lock, after active_owner and not_found, before its first write');
select ok(pg_temp.last_at('owner_reset_request', 'public.system_administrators') > pg_temp.last_at('owner_reset_request', 'for no key update')
          and pg_temp.last_at('owner_reset_request', 'public.system_administrators') > pg_temp.last_at('owner_reset_request', '''not_found''')
          and pg_temp.last_at('owner_reset_request', 'public.system_administrators') > pg_temp.last_at('owner_reset_request', '''inactive''')
          and pg_temp.last_at('owner_reset_request', 'public.system_administrators') < pg_temp.first_write('owner_reset_request'),
  'A-140, A-141 - owner_reset_request re-reads the System Administrator after its locks, after not_found and inactive, before its first write (structural only: it calls no helper a runtime case could replace, so no single-session runtime case holds it - S-01 D M1 finding 9)');
select is((select array_agg(f order by f) from unnest(pg_temp.three()) f
            where substr(pg_temp.src(f), pg_temp.last_at(f, 'public.system_administrators') - 200, 400)
                  !~* 'role_refused'),
  null, 'A-140 - each re-check refuses role_refused (detail sysadmin, as the header does)');

-- ── Rows 29, 30: S-01 d10, A-146 — the restored Owner's Stores, then the re-check ──
select ok(pg_temp.at('owner_recover', 'app_internal.store_set(') > pg_temp.at('owner_recover', 'order by u.id')
          and pg_temp.at('owner_recover', 'app_internal.lock_store_assignments(') > pg_temp.at('owner_recover', 'app_internal.store_set(')
          and pg_temp.at('owner_recover', 'app_internal.lock_store_assignments(') > pg_temp.at('owner_recover', '''active'''),
  'A-138, S-01 d10 - owner_recover reads the restored Owner''s Stores after step 3, then locks them and their assignments (steps 4 and 5), after the subjects'' refusals');
select ok(pg_temp.last_at('owner_recover', 'public.system_administrators') > pg_temp.at('owner_recover', 'app_internal.lock_store_assignments('),
  'A-140, A-146 - owner_recover''s re-check comes after its last lock, steps 4 and 5 included');
select ok(pg_temp.at('owner_recover', 'app_internal.initials_holder(') > pg_temp.at('owner_recover', 'app_internal.lock_store_assignments(')
          and pg_temp.at('owner_recover', 'app_internal.pin_taken(') > pg_temp.at('owner_recover', 'app_internal.lock_store_assignments('),
  'S-01 d10, M-04 d63 - the clash is read through the shared helpers (initials_holder, pin_taken), under the Stores'' lock, not a copy');
select ok(pg_temp.times('owner_recover', 'from public.store_assignments') = 0
          and pg_temp.times('owner_recover', 'into public.store_assignments') = 0,
  'S-01 d10 - owner_recover reads and writes no assignment itself: the Store set is app_internal.store_set''s, and the Stores stay');
select ok(pg_temp.at('owner_recover', 'delete from public.user_pins') > pg_temp.last_at('owner_recover', 'public.system_administrators')
          and pg_temp.times('owner_recover', 'delete from public.') = 1,
  'S-01 d10, A-137 - a clashing PIN is cleared by deleting its user_pins row (the one delete), after the re-check');
select ok(pg_temp.at('owner_recover', '''deactivated''') > pg_temp.last_at('owner_recover', 'public.system_administrators')
          and pg_temp.at('owner_recover', '''deactivated''') < pg_temp.last_at('owner_recover', 'app_internal.initials_holder('),
  'A-146, S-01 d11 - the replaced Owner is deactivated after the re-check and before the clash is read, so their own initials and PIN clash with nothing (the fake''s order)');
select ok(pg_temp.last_at('owner_recover', 'app_internal.active_owner_count(') > pg_temp.last_at('owner_recover', 'insert into public.users')
          and pg_temp.src('owner_recover') ~* 'active_owner_count\(p_org_id\)\s*<\s*1',
  'A-146 - after its writes owner_recover asserts the Organization still has an active Owner (M-04 d26''s floor at every commit)');
select ok(pg_temp.at('owner_recover', 'pg_catalog.lower(') > pg_temp.at('owner_recover', 'order by u.id')
          and pg_temp.at('owner_recover', '''p_owner_email''') > pg_temp.at('owner_recover', 'pg_catalog.lower(')
          and pg_temp.at('owner_recover', '''p_owner_email''') < pg_temp.last_at('owner_recover', 'public.system_administrators'),
  'A-141, S-01 d15 - owner_recover''s d15 comparison and its refusal (invalid_input, p_owner_email) come after step 3 and before the A-140 re-check: the act''s own refusal precedes the re-check (S-01 D M1 finding 49)');

select * from finish();
rollback;
