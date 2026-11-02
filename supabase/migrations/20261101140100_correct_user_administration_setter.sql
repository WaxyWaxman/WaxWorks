set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1, rework pass 3 — five of the ten user-administration functions,
-- replaced again (A-101: 20261101130200 is merged and never edited), to:
--
--   Row 55, M-04 d59 (finding 37) — user_add, user_change_role, user_reactivate
--     and user_set_pin record a PIN's setter from the role
--     app_internal.authoriser_recheck returns (20261101140000) after the last
--     lock, never from the header's v_by_role, read before the wait.
--   Row 56, M-04 d61 (finding 38) — user_change_role, in d55's replace case,
--     refuses pin_required when the PIN given equals the held one, compared
--     through app_internal.pin_hash before any clash check; nothing is written.
--   Finding 43 — user_correct re-checks its authoriser (A-140) before its
--     initials check, as user_add, user_assign and user_reactivate already do.
--
-- Unchanged: the header, A-138's lock order, A-119's returned refusals, every
-- other refusal and its order, the log shapes, the signatures. The other five
-- (user_deactivate, user_assign, user_unassign, user_reset_request,
-- user_invite_resend) stand as 20261101130200 left them; they `perform` the
-- re-check and write no PIN.

-- ════════════════════════════════════════════════════════════════════════════
-- user_add — M; O for a Manager or Owner (M-04 d30)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_add(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid    default null,
  p_manager_pin    text    default null,
  p_display_name   text    default null,
  p_initials       text    default null,
  p_role           text    default null,
  p_email          text    default null,
  p_store_ids      uuid[]  default null,
  p_pin            text    default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_principal text := authz.principal();
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_set_role  text;
  v_entry     jsonb;
  v_held      uuid[];
  v_name      text;
  v_initials  text;
  v_email     text;
  v_stores    uuid[] := '{}';
  v_store     uuid;
  v_holder    text;
  v_hash      text;
  v_invite    boolean;
  v_id        uuid;
  v_log       jsonb;
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  -- M-04 d51, d58: at the till Add creates Employees only, and sets no PIN —
  -- refused before the actor, the terminal, the guard and any PIN are read.
  if v_principal = 'store' and (p_pin is not null or p_role is distinct from 'employee') then
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  -- ── Header (A-103, held once: app_internal.header) ──
  v_h := app_internal.header(p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin);
  if v_h ? 'code' then
    return v_h;
  end if;
  v_by_id := (v_h ->> 'by_user_id')::uuid;
  v_by_role := v_h ->> 'by_role';
  v_entry := v_h -> 'entry';

  -- ── Body ──
  -- M-04 d30: creating a Manager or an Owner is Owner-only — asked first, as the
  -- fake asks it (finding 14).
  if p_role is distinct from 'employee' and v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- Arguments the database itself rejects (conventions §5's note).
  if p_role is null or p_role not in ('employee', 'manager', 'owner') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_role';
  end if;
  v_name := nullif(pg_catalog.btrim(p_display_name), '');
  if v_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_display_name';
  end if;
  -- Each Store is this Organization's (A-86), and a Manager adds at their own (M-04 d30).
  v_held := app_internal.store_set(v_org_id, v_by_id);
  foreach v_store in array coalesce(p_store_ids, '{}') loop
    if v_store is null or not exists (select 1 from public.stores s where s.id = v_store and s.org_id = v_org_id) then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if v_by_role <> 'owner' and not v_store = any(v_held) then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
    if not v_store = any(v_stores) then
      v_stores := v_stores || v_store;
    end if;
  end loop;
  -- M-04 d27: an Employee or a Manager holds at least one Store.
  if p_role <> 'owner' and cardinality(v_stores) = 0 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'no_store';
  end if;
  -- M-04 d20: trimmed and upper-cased on write. M-04 d34: a Store needs initials.
  v_initials := nullif(pg_catalog.upper(pg_catalog.btrim(p_initials)), '');
  if cardinality(v_stores) > 0 and v_initials is null then
    raise exception 'initials_required' using errcode = '23502';
  end if;
  -- M-04 d28: Employees have no PIN. M-04 d35: a Manager or Owner holding a Store does.
  if p_role = 'employee' and p_pin is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  if p_role <> 'employee' and cardinality(v_stores) > 0 and p_pin is null then
    raise exception 'pin_required' using errcode = '23502';
  end if;
  -- M-04 d29, d33: a Manager or Owner needs an email; an Employee's is optional (d36).
  v_email := nullif(pg_catalog.btrim(p_email), '');
  if p_role <> 'employee' and v_email is null then
    raise exception 'email_required' using errcode = '23502';
  end if;
  -- A-89: exactly four digits.
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
  end if;

  -- A-138 steps 4 and 5 (no subject row exists yet).
  perform app_internal.lock_store_assignments(v_org_id, v_stores);
  -- A-140: the authoriser, after the last lock — an Owner for a Manager or Owner,
  -- otherwise a Manager still holding every Store given. M-04 d59: the role it
  -- read is the role a PIN written below is recorded as set by.
  v_set_role := app_internal.authoriser_recheck(v_org_id, v_by_id, case when p_role = 'employee' then 'manager' else 'owner' end, v_stores, true);
  -- Under the Stores' lock, initials then the PIN, Store by Store.
  if p_pin is not null then
    v_hash := app_internal.pin_hash(p_pin);
  end if;
  foreach v_store in array v_stores loop
    v_holder := app_internal.initials_holder(v_org_id, array[v_store], v_initials, null);
    if v_holder is not null then
      raise exception 'initials_clash' using errcode = '23505', detail = v_holder;   -- M-04 d13: naming the holder
    end if;
    -- M-04 d32's note: a clash at Add is raised and unlogged — no row to log against.
    if v_hash is not null and app_internal.pin_taken(v_org_id, array[v_store], v_hash, null) is not null then
      raise exception 'pin_clash' using errcode = '23505';
    end if;
  end loop;

  -- ── Writes ──
  v_invite := p_role <> 'employee';                                              -- M-04 d29, d43
  v_log := jsonb_build_array(v_entry || jsonb_build_object('action', 'user_added',
             'after', jsonb_build_object('role', p_role, 'initials', v_initials, 'store_ids', to_jsonb(v_stores), 'email', v_email)));
  if v_hash is not null then
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'));     -- A-93: never the value
  end if;
  if v_invite then
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent'));
  end if;
  insert into public.users (org_id, role, initials, display_name, email, log, enrolment_open_until)
  values (v_org_id, p_role, v_initials, v_name, v_email, v_log,
          case when v_invite then pg_catalog.now() + interval '24 hours' end)    -- A-131: same transaction as the log
  returning id into v_id;
  insert into public.store_assignments (org_id, user_id, store_id)
  select v_org_id, v_id, x from unnest(v_stores) x;
  if v_hash is not null then
    -- M-04 d55, d59: set by the Owner who added them (d30 makes it Owner-only),
    -- as the re-check read them after the last lock.
    insert into public.user_pins (org_id, user_id, pin_hash, set_by)
    values (v_org_id, v_id, v_hash, app_internal.pin_setter(v_by_id, v_set_role, v_id));
  end if;
  return jsonb_build_object('user_id', v_id, 'invite', v_invite);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_change_role — O wherever Manager or Owner is the role before or after
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_change_role(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_role           text default null,
  p_email          text default null,
  p_pin            text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_principal text := authz.principal();
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_set_role  text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_email     text;
  v_set_by    text;
  v_held      text;
  v_holds     boolean;
  v_stale     boolean;
  v_hash      text;
  v_clash     uuid;
  v_promotion boolean;
  v_invite    boolean;
  v_before    jsonb;
  v_after     jsonb;
  v_log       jsonb := '[]';
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  -- M-04 d51: a promotion that sets a PIN runs on a personal session only.
  if v_principal = 'store' and p_pin is not null then
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  -- ── Header (A-103, held once: app_internal.header) ──
  v_h := app_internal.header(p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin);
  if v_h ? 'code' then
    return v_h;
  end if;
  v_by_id := (v_h ->> 'by_user_id')::uuid;
  v_by_role := v_h ->> 'by_role';
  v_entry := v_h -> 'entry';
  -- O (§6, M-04 d30): is this an Owner — refused by name.
  if v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;

  -- ── Body ──
  if p_role is null or p_role not in ('employee', 'manager', 'owner') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_role';
  end if;
  -- A-138 step 2: the active Owners, for the floor (M-04 d26).
  perform app_internal.lock_active_owners(v_org_id);
  -- A-138 step 3: the subject, before its state is read.
  select u.id, u.role, u.email, u.active, u.passkey_enrolled_at into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id
     for no key update;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- Read under the subject's lock: its Store set, and whether — and by whom — a PIN
  -- is held, and its hash (M-04 d61 compares a replacement with it).
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  select p.set_by, p.pin_hash into v_set_by, v_held from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
  v_holds := v_set_by is not null;
  -- A-138 steps 4 and 5, when a PIN is to be clash-checked at those Stores.
  if p_pin is not null then
    perform app_internal.lock_store_assignments(v_org_id, v_stores);
  end if;

  -- M1-contracts-3 finding 5: a same-role call writes nothing — before inactive.
  if v_u.role = p_role then
    return jsonb_build_object('user_id', v_u.id, 'invite', false, 'email', null);
  end if;
  v_promotion := array_position(array['employee', 'manager', 'owner'], p_role)
               > array_position(array['employee', 'manager', 'owner'], v_u.role);    -- M-04 d25's strict supersets
  -- M-04 d44, d46: no role change for a deactivated person; reactivate first.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;
  -- M-04 d26: the floor, counted after the last lock (A-138).
  if v_u.role = 'owner' and app_internal.active_owner_count(v_org_id) <= 1 then
    raise exception 'owner_floor' using errcode = '23514';
  end if;
  -- A-140: the authoriser, after the last lock and after the floor — still an
  -- active Owner. Two Owners demoting each other: the second meets the floor
  -- (row 47); an Owner demoted while their own act waited: refused here (row 53).
  -- M-04 d59: the role it read is the role a PIN written below is recorded as set by.
  v_set_role := app_internal.authoriser_recheck(v_org_id, v_by_id, 'owner', null, false);
  -- M-04 d27: an Employee or a Manager holds a Store; a demotion is a door to that state.
  if p_role <> 'owner' and cardinality(v_stores) = 0 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'no_store';
  end if;
  v_email := coalesce(nullif(pg_catalog.btrim(p_email), ''), v_u.email);
  -- M-04 d39: a demotion sent with a PIN is refused as Add refuses one.
  if p_role = 'employee' and p_pin is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  -- M-04 d53: a demotion sends no invite, so an address on it is refused; Correct changes it.
  if not v_promotion and p_email is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'email_not_needed';
  end if;
  if p_role <> 'employee' then
    -- M-04 d33: the role change requires the email.
    if v_email is null then
      raise exception 'email_required' using errcode = '23502';
    end if;
    -- M-04 d55: a held PIN carries into Owner standing only if an Owner or its
    -- holder last set it; one a Manager set counts as none held, and must be replaced.
    v_stale := v_promotion and p_role = 'owner' and v_holds and v_set_by = 'manager';
    -- M-04 d52: a PIN at promotion only for someone who holds none that carries.
    if v_holds and not v_stale and p_pin is not null then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'pin_not_needed';
    end if;
    -- M-04 d35, d55: into Manager, or an Owner holding a Store, needs a PIN if none
    -- that carries is held — and so does one whose held PIN a Manager set.
    if (not v_holds or v_stale) and p_pin is null and (p_role = 'manager' or cardinality(v_stores) > 0 or v_stale) then
      raise exception 'pin_required' using errcode = '23502';
    end if;
    if p_pin is not null then
      if p_pin !~ '^[0-9]{4}$' then
        raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
      end if;
      v_hash := app_internal.pin_hash(p_pin);
      -- M-04 d61: in d55's replace case the new PIN must differ from the held one,
      -- compared through the one keyed hash; the same digits are refused as if no
      -- new PIN were given — before any clash check, and nothing is written.
      if v_stale and v_hash = v_held then
        raise exception 'pin_required' using errcode = '23502';
      end if;
      -- §5.1, M-04 d28: the clash at every Store of the holder, under the lock taken above.
      v_clash := app_internal.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
      if v_clash is not null then
        -- M-04 d32, A-119: logged on the subject, then returned so the log commits.
        return app_internal.pin_clash_refused(v_org_id, v_u.id, v_entry, v_clash);
      end if;
    end if;
  end if;

  -- ── Writes ──
  -- M-04 d43, A-117: any promotion invites while the person has never enrolled.
  v_invite := v_promotion and v_u.passkey_enrolled_at is null;
  -- M-04 d42: a changed email is logged before and after (a promotion only, d53).
  if v_email is distinct from v_u.email then
    v_before := jsonb_build_object('role', v_u.role, 'email', v_u.email);
    v_after := jsonb_build_object('role', p_role, 'email', v_email);
  else
    v_before := jsonb_build_object('role', v_u.role);
    v_after := jsonb_build_object('role', p_role);
  end if;
  if v_hash is not null then
    -- M-04 d52, d55: a new PIN reaches here only for someone holding none, or one a
    -- Manager set — which it replaces. Recorded with its setter, an Owner (d30), as
    -- the re-check read them after the last lock (d59).
    insert into public.user_pins (org_id, user_id, pin_hash, set_by)
    values (v_org_id, v_u.id, v_hash, app_internal.pin_setter(v_by_id, v_set_role, v_u.id))
        on conflict (user_id) do update set pin_hash = excluded.pin_hash, set_by = excluded.set_by;
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'));
  end if;
  -- M-04 d39: a demotion to Employee clears the PIN, logged as cleared (A-137).
  if p_role = 'employee' then
    delete from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
    if found then
      v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_cleared'));
    end if;
  end if;
  v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'role_changed', 'before', v_before, 'after', v_after));
  if v_invite then
    -- M-04 d42: the invite row names where the invite went (identity data, A-93).
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent', 'after', jsonb_build_object('email', v_email)));
  end if;
  update public.users u
     set role = p_role,
         email = v_email,
         log = u.log || v_log,
         enrolment_open_until = case when v_invite then pg_catalog.now() + interval '24 hours' else u.enrolment_open_until end   -- A-131
   where u.id = v_u.id and u.org_id = v_org_id;
  -- A-91: the Server Action sends the invite to the address returned here.
  return jsonb_build_object('user_id', v_u.id, 'invite', v_invite, 'email', case when v_invite then v_email end);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_reactivate — M; O for a Manager or Owner (M-04 d19, d30, d37, d40, d47, d51)
-- Its order of checks, exactly (M1-contracts-3 finding 4): in reach → active →
-- initials (raised) → employee_has_no_pin → pin_not_needed → pin_clash
-- (returned and logged) → writes.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_reactivate(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_initials       text default null,
  p_pin            text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_principal text := authz.principal();
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_set_role  text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_store     uuid;
  v_initials  text;
  v_holder    text;
  v_old       text;
  v_hash      text;
  v_fresh     text;
  v_clash     uuid;
  v_log       jsonb := '[]';
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  -- M-04 d51: a reactivation that gives a new PIN runs on a personal session only.
  if v_principal = 'store' and p_pin is not null then
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  -- ── Header (A-103, held once: app_internal.header) ──
  v_h := app_internal.header(p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin);
  if v_h ? 'code' then
    return v_h;
  end if;
  v_by_id := (v_h ->> 'by_user_id')::uuid;
  v_by_role := v_h ->> 'by_role';
  v_entry := v_h -> 'entry';

  -- ── Body ──
  -- A-138 step 3: the subject, before its state is read.
  select u.id, u.role, u.active, u.initials into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id
     for no key update;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  -- In reach (M-04 d30, d37).
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not (v_stores && app_internal.store_set(v_org_id, v_by_id)) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d47: nothing to restore for someone already active.
  if v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'active';
  end if;
  -- Read under the subject's lock: its PIN hash.
  select p.pin_hash into v_old from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
  -- A-138 steps 4 and 5: initials and PIN are checked under the Stores' lock.
  perform app_internal.lock_store_assignments(v_org_id, v_stores);
  -- A-140: the authoriser, after the last lock. M-04 d59: the role it read is the
  -- role a new PIN written below is recorded as set by.
  v_set_role := app_internal.authoriser_recheck(v_org_id, v_by_id, case when v_u.role = 'employee' then 'manager' else 'owner' end, v_stores, false);
  -- M-04 d19: reused initials are refused naming the holder, and the screen asks for new ones.
  v_initials := coalesce(nullif(pg_catalog.upper(pg_catalog.btrim(p_initials)), ''), v_u.initials);
  if v_initials is not null then
    foreach v_store in array v_stores loop
      v_holder := app_internal.initials_holder(v_org_id, array[v_store], v_initials, v_u.id);
      if v_holder is not null then
        raise exception 'initials_clash' using errcode = '23505', detail = v_holder;
      end if;
    end loop;
  end if;
  -- M-04 d28: Employees have no PIN.
  if v_u.role = 'employee' and p_pin is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  if p_pin is not null then
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
    end if;
    -- M-04 d47, d49: a new PIN only where the old one clashes; otherwise Set PIN changes it.
    if v_old is null or app_internal.pin_taken(v_org_id, v_stores, v_old, v_u.id) is null then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'pin_not_needed';
    end if;
    v_fresh := app_internal.pin_hash(p_pin);
  end if;
  v_hash := coalesce(v_fresh, v_old);
  -- M-04 d40: the PIN stays unique at each Store — refused unnamed and logged (d32, A-121).
  if v_u.role <> 'employee' and v_hash is not null then
    v_clash := app_internal.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
    if v_clash is not null then
      return app_internal.pin_clash_refused(v_org_id, v_u.id, v_entry, v_clash);
    end if;
  end if;

  -- ── Writes ──
  -- M-04 d19: the original row, restored.
  if v_fresh is not null then
    -- M-04 d55, d59: recorded with its setter, who reactivated them, as the re-check
    -- read them after the last lock.
    update public.user_pins p
       set pin_hash = v_fresh, set_by = app_internal.pin_setter(v_by_id, v_set_role, v_u.id)
     where p.org_id = v_org_id and p.user_id = v_u.id;
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'));      -- never the value
  end if;
  v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reactivated',
             'before', jsonb_build_object('active', v_u.active, 'initials', v_u.initials),
             'after', jsonb_build_object('active', true, 'initials', v_initials)));
  update public.users u
     set active = true, initials = v_initials, log = u.log || v_log
   where u.id = v_u.id and u.org_id = v_org_id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_correct — M (M-04 d22, d30, d37, d57); a Manager or Owner is corrected by an Owner
-- Each field is optional and an omitted one is unchanged (the contract). For
-- p_email a null CLEARS the address, so its default is a value no caller sends,
-- compared trimmed (finding 19).
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_correct(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_initials       text default null,
  p_display_name   text default null,
  p_email          text default '(unchanged)'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_store     uuid;
  v_holder    text;
  v_initials  text;
  v_name      text;
  v_email     text;
begin
  -- ── Header (A-103, held once: app_internal.header) ──
  v_h := app_internal.header(p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin);
  if v_h ? 'code' then
    return v_h;
  end if;
  v_by_id := (v_h ->> 'by_user_id')::uuid;
  v_by_role := v_h ->> 'by_role';
  v_entry := v_h -> 'entry';

  -- ── Body ──
  -- A-138 step 3: the subject, before its state is read.
  select u.id, u.role, u.initials, u.display_name, u.email into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id
     for no key update;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- Read under the subject's lock: the Stores the corrected initials must be unique at.
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  -- In reach (M-04 d30, d37).
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not (v_stores && app_internal.store_set(v_org_id, v_by_id)) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  v_initials := v_u.initials;
  v_name := v_u.display_name;
  v_email := v_u.email;
  -- A-138 steps 4 and 5, only when there are initials to check (finding 20).
  if p_initials is not null then
    perform app_internal.lock_store_assignments(v_org_id, v_stores);
  end if;
  -- A-140: the authoriser, after the last lock and before any check that names
  -- someone — an authoriser who stopped qualifying while waiting learns no
  -- initials holder's name (finding 43), as in user_add, user_assign, user_reactivate.
  perform app_internal.authoriser_recheck(v_org_id, v_by_id, case when v_u.role = 'employee' then 'manager' else 'owner' end, v_stores, false);
  if p_initials is not null then
    v_initials := nullif(pg_catalog.upper(pg_catalog.btrim(p_initials)), '');               -- M-04 d20
    if v_initials is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_initials';
    end if;
    foreach v_store in array v_stores loop
      v_holder := app_internal.initials_holder(v_org_id, array[v_store], v_initials, v_u.id);
      if v_holder is not null then
        raise exception 'initials_clash' using errcode = '23505', detail = v_holder;   -- M-04 d13: naming the holder
      end if;
    end loop;
  end if;
  if p_display_name is not null then
    v_name := nullif(pg_catalog.btrim(p_display_name), '');
    if v_name is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_display_name';
    end if;
  end if;
  if p_email is null or pg_catalog.btrim(p_email) <> '(unchanged)' then
    v_email := nullif(pg_catalog.btrim(p_email), '');
    -- M-04 d29, d33: a Manager's or Owner's invite and re-enrolment need the address.
    if v_email is null and v_u.role <> 'employee' then
      raise exception 'email_required' using errcode = '23502';
    end if;
  end if;
  -- M-04 d57: a Correct that changes nothing — every field omitted, or each equal
  -- to its current value after d20's normalisation — succeeds and writes nothing.
  if v_initials is not distinct from v_u.initials
     and v_name is not distinct from v_u.display_name
     and v_email is not distinct from v_u.email then
    return jsonb_build_object('user_id', v_u.id);
  end if;

  -- ── Writes ── (A-55: before and after)
  update public.users u
     set initials = v_initials, display_name = v_name, email = v_email,
         log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'corrected',
                 'before', jsonb_build_object('initials', v_u.initials, 'display_name', v_u.display_name, 'email', v_u.email),
                 'after', jsonb_build_object('initials', v_initials, 'display_name', v_name, 'email', v_email)))
   where u.id = v_u.id and u.org_id = v_org_id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_set_pin — M, on a personal session only (M-04 d28, d35, d41, d48, d50, d51, d55, d56)
-- M-04 d51: every act that sets a PIN runs on a personal session, never at the
-- till, so this function has no store-session path: on any other principal it
-- refuses role_refused / person after the tenant and before the header.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_set_pin(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_pin            text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_principal text := authz.principal();
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_set_role  text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_hash      text;
  v_clash     uuid;
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  -- M-04 d51: a PIN is set on a personal session only, never at the till.
  if v_principal is distinct from 'person' then
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  -- ── Header (A-103, held once: app_internal.header): on a personal session the
  -- actor, the guard, and the session holder as authoriser (M-04 d31) ──
  v_h := app_internal.header(p_actor_user_id, p_actor_initials, p_request_id, p_terminal_id, p_manager_pin);
  if v_h ? 'code' then
    return v_h;
  end if;
  v_by_id := (v_h ->> 'by_user_id')::uuid;
  v_by_role := v_h ->> 'by_role';
  v_entry := v_h -> 'entry';

  -- ── Body ──
  -- A-138 step 3: the subject, before its state is read.
  select u.id, u.role, u.active into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id
     for no key update;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d28: Employees have no PIN.
  if v_u.role = 'employee' then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  -- Read under the subject's lock: its Store set.
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  -- M-04 d41, d50: a Manager sets the PIN only of a Manager who shares one of
  -- their Stores — never an Owner's; an Owner's is an Owner's to set.
  if v_by_role <> 'owner' and (v_u.role = 'owner' or not (v_stores && app_internal.store_set(v_org_id, v_by_id))) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d48: nothing is done to a deactivated person's standing; reactivate first.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;
  -- M-04 d35: a Manager or Owner who holds a Store holds a PIN.
  if p_pin is null and cardinality(v_stores) > 0 then
    raise exception 'pin_required' using errcode = '23502';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
  end if;
  -- A-138 steps 4 and 5; §5.1, M-04 d28: unique at every Store of the holder (none,
  -- for a clear: a clear reaches here only for someone holding no Store).
  perform app_internal.lock_store_assignments(v_org_id, v_stores);
  -- A-140: the authoriser, after the last lock — an Owner for an Owner's PIN, a
  -- Manager still sharing a Store for a Manager's. M-04 d59: the role it read is
  -- the role the PIN is recorded as set by — an Owner demoted while this waited
  -- sets a Manager's PIN as a Manager.
  v_set_role := app_internal.authoriser_recheck(v_org_id, v_by_id, case when v_u.role = 'owner' then 'owner' else 'manager' end, v_stores, false);
  if p_pin is null then
    -- M-04 d56: cleared, and logged as cleared only when a PIN was held (A-137).
    delete from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
    if found then
      update public.users u
         set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_cleared'))
       where u.id = v_u.id and u.org_id = v_org_id;
    end if;
    return jsonb_build_object('user_id', v_u.id);
  end if;
  v_hash := app_internal.pin_hash(p_pin);
  v_clash := app_internal.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
  if v_clash is not null then
    -- M-04 d32, A-119: unnamed, logged on the subject, returned so the log commits.
    return app_internal.pin_clash_refused(v_org_id, v_u.id, v_entry, v_clash);
  end if;

  -- ── Writes ── (M-04 d28: logged as changed, never as a value; d55, d59: who set it)
  insert into public.user_pins (org_id, user_id, pin_hash, set_by)
  values (v_org_id, v_u.id, v_hash, app_internal.pin_setter(v_by_id, v_set_role, v_u.id))
      on conflict (user_id) do update set pin_hash = excluded.pin_hash, set_by = excluded.set_by;
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'))
   where u.id = v_u.id and u.org_id = v_org_id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- A-103, A-107: revoked from public, granted to authenticated alone. (create or
-- replace keeps the grants already given; restated so this file stands alone.)
revoke execute on function app.user_add(uuid, text, uuid, uuid, text, text, text, text, text, uuid[], text)   from public;
revoke execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)        from public;
revoke execute on function app.user_reactivate(uuid, text, uuid, uuid, text, uuid, text, text)               from public;
revoke execute on function app.user_correct(uuid, text, uuid, uuid, text, uuid, text, text, text)            from public;
revoke execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text)                        from public;
grant  execute on function app.user_add(uuid, text, uuid, uuid, text, text, text, text, text, uuid[], text)   to authenticated;
grant  execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)        to authenticated;
grant  execute on function app.user_reactivate(uuid, text, uuid, uuid, text, uuid, text, text)               to authenticated;
grant  execute on function app.user_correct(uuid, text, uuid, uuid, text, uuid, text, text, text)            to authenticated;
grant  execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text)                        to authenticated;

reset role;
