set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- S-01 D M1, rework pass 4 — user_change_role, organization_create and owner_recover
-- corrected (A-101: 20261101140100, 20261108223527 and 20261109020846 are merged
-- and never edited; this follows them). What changes, by Checklist row:
--
--   38  A-150 — a demotion to Employee closes the person's enrolment window:
--       user_change_role, when the new role is employee, sets
--       enrolment_open_until = null in the statement that writes the role. As
--       before otherwise: a promotion that invites sets now + 24 hours (A-131),
--       any other change leaves the column. user_change_role is the M-04 D
--       order's function (20261101140100), unchanged in every other statement,
--       refusal, lock, log entry, the header, owner and grants.
--   40  conventions §5 (finding 48) — "trim" is leading and trailing space, tab,
--       line feed and carriage return, as the wrapper's .trim() strips them:
--       organization_create's three text arguments, owner_recover's new Owner's
--       name and email, and S-01 d15's comparison (both sides) call
--       pg_catalog.btrim(…, E' \t\n\r') where they called pg_catalog.btrim(…).
--       Nothing else in either function changes.
--
-- Unchanged: the signatures and grants (restated so this file reads complete).

-- ════════════════════════════════════════════════════════════════════════════
-- user_change_role — O wherever Manager or Owner is the role before or after (A-150)
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
  -- A-150: a demotion to Employee closes the enrolment window in the statement that
  -- writes the role, so a link outstanding at the demotion opens no session after a
  -- later promotion; a promotion opens a fresh window only if it invites (A-131).
  update public.users u
     set role = p_role,
         email = v_email,
         log = u.log || v_log,
         enrolment_open_until = case when p_role = 'employee' then null                         -- A-150
                                     when v_invite then pg_catalog.now() + interval '24 hours'  -- A-131
                                     else u.enrolment_open_until end
   where u.id = v_u.id and u.org_id = v_org_id;
  -- A-91: the Server Action sends the invite to the address returned here.
  return jsonb_build_object('user_id', v_u.id, 'invite', v_invite, 'email', case when v_invite then v_email end);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- organization_create — S (A-90; S-01 d2, d5; conventions §5, finding 4)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.organization_create(
  p_actor_user_id uuid,
  p_request_id    uuid,
  p_name          text,
  p_owner_name    text,
  p_owner_email   text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry      jsonb;
  v_org_id     uuid := pg_catalog.gen_random_uuid();
  v_owner      uuid := pg_catalog.gen_random_uuid();
  v_name       text;
  v_owner_name text;
  v_email      text;
begin
  -- ── Header (A-113) ──
  if authz.principal() is distinct from 'sysadmin' then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;
  if p_actor_user_id is distinct from
     nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid then
    raise exception 'actor_mismatch' using errcode = '28000';
  end if;
  -- A-110: an active row. A-140: no lock follows, so this read is the re-check.
  if not exists (select 1 from public.system_administrators a where a.auth_user_id = p_actor_user_id and a.active) then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;
  v_entry := jsonb_build_object('at', pg_catalog.now(), 'actor_user_id', p_actor_user_id, 'manager_user_id', null,
                                'request_id', p_request_id, 'terminal_id', null, 'principal', 'sysadmin');   -- A-94, A-110

  -- ── Arguments (conventions §5, finding 4: the function is the enforcement point) ──
  v_name := nullif(pg_catalog.btrim(p_name, E' \t\n\r'), '');
  if v_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_name';
  end if;
  v_owner_name := nullif(pg_catalog.btrim(p_owner_name, E' \t\n\r'), '');
  if v_owner_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_owner_name';
  end if;
  -- A-117: invite implies email — the first Owner is invited, so has an address.
  v_email := nullif(pg_catalog.btrim(p_owner_email, E' \t\n\r'), '');
  if v_email is null then
    raise exception 'email_required' using errcode = '23502';
  end if;

  -- ── Writes ──
  -- A-86, A-135: the tenant's root; its id is its tenant key. S-01 d3, O-01 d5:
  -- logged where its Owners read it.
  insert into public.organizations (id, name, log)
  values (v_org_id, v_name,
          jsonb_build_array(v_entry || jsonb_build_object('action', 'organization_created', 'before', null,
                                                          'after', jsonb_build_object('name', v_name, 'owner_user_id', v_owner))));
  -- S-01 d2, d5; M-04 d27, d34: the first Owner — a name and an email, no
  -- initials, no Store. A-114: the invite logged, never sent here (A-91).
  -- A-131: the window opens with the log entry.
  insert into public.users (id, org_id, role, initials, display_name, email, log, enrolment_open_until)
  values (v_owner, v_org_id, 'owner', null, v_owner_name, v_email,
          jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent')),
          pg_catalog.now() + interval '24 hours');
  return jsonb_build_object('org_id', v_org_id, 'owner_user_id', v_owner);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- owner_recover — S (A-90, A-144, A-146, A-148; S-01 d3, d9, d10, d11, d12,
-- d14, d15; M-04 d19, d26, d63)
-- Either p_user_id (a deactivated Owner to reactivate) or a new Owner's name and
-- email (conventions §5). With p_replace_user_id, the active Owner named there is
-- deactivated in the same act (A-146); without it, refused while an active Owner exists.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.owner_recover(
  p_actor_user_id    uuid,
  p_request_id       uuid,
  p_org_id           uuid,
  p_user_id          uuid default null,
  p_owner_name       text default null,
  p_owner_email      text default null,
  p_replace_user_id  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry     jsonb;
  v_r         record;   -- the Owner replaced (A-146)
  v_u         record;   -- the Owner reactivated
  v_name      text;
  v_email     text;
  v_stores    uuid[];
  v_hash      text;
  v_initials  text;
  v_pin_kept  boolean;
  v_id        uuid;
  v_invite    boolean;
  v_ulog      jsonb;
  v_olog      jsonb := '[]';
begin
  -- ── Header (A-113) ──
  if authz.principal() is distinct from 'sysadmin' then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;
  if p_actor_user_id is distinct from
     nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid then
    raise exception 'actor_mismatch' using errcode = '28000';
  end if;
  if not exists (select 1 from public.system_administrators a where a.auth_user_id = p_actor_user_id and a.active) then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;
  v_entry := jsonb_build_object('at', pg_catalog.now(), 'actor_user_id', p_actor_user_id, 'manager_user_id', null,
                                'request_id', p_request_id, 'terminal_id', null, 'principal', 'sysadmin');   -- A-94, A-110

  -- ── Arguments (conventions §5: the database rejects what the wrapper would) ──
  -- Finding 16: p_user_id with a name or an email (both), or none of the three,
  -- is the shape's refusal; a new Owner's half-given name and email are answered
  -- below, as organization_create answers them.
  if p_user_id is not null then
    if p_owner_name is not null or p_owner_email is not null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_user_id';
    end if;
  elsif p_owner_name is null and p_owner_email is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_user_id';
  end if;
  -- A-146: the replaced and the restored person are distinct.
  if p_replace_user_id is not null and p_replace_user_id = p_user_id then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_replace_user_id';
  end if;
  if p_user_id is null then
    -- Finding 4: a new Owner's name and address, trimmed; A-117: invite implies email.
    v_name := nullif(pg_catalog.btrim(p_owner_name, E' \t\n\r'), '');
    if v_name is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_owner_name';
    end if;
    v_email := nullif(pg_catalog.btrim(p_owner_email, E' \t\n\r'), '');
    if v_email is null then
      raise exception 'email_required' using errcode = '23502';
    end if;
  end if;

  -- ── Body ──
  -- A-144, S-01 d12: the Organization's row, after the header and before step 2;
  -- the organizations.log append below re-takes it. A-86: unknown → not_found.
  perform 1 from public.organizations o where o.id = p_org_id for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- A-138 step 2: the Organization's active Owner rows, then the count under the
  -- lock. A-146: with no Owner named to replace, refused while one is active —
  -- before any subject is read (fake/identity.ts:590).
  perform app_internal.lock_active_owners(p_org_id);
  if p_replace_user_id is null and app_internal.active_owner_count(p_org_id) > 0 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'active_owner';
  end if;
  -- A-138 step 3, A-146: both subjects' rows, in id order, in one statement.
  perform 1 from public.users u
   where u.org_id = p_org_id and u.id in (p_replace_user_id, p_user_id)
   order by u.id
     for no key update;
  if p_replace_user_id is not null then
    -- A-146: an active Owner of THIS Organization — else not_found (a Manager, an
    -- Owner elsewhere, nobody); already deactivated → inactive (the plain call is the remedy).
    select u.id, u.role, u.active, u.email into v_r
      from public.users u where u.id = p_replace_user_id and u.org_id = p_org_id;
    if v_r.id is null or v_r.role <> 'owner' then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if not v_r.active then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
    end if;
    -- S-01 d15: not a "new" Owner at the replaced Owner's own address — compared
    -- trimmed and without regard to case; a replaced Owner with no address matches
    -- nothing (the fake, fake/identity.ts:604-607). Before anything is written.
    if p_user_id is null and pg_catalog.lower(pg_catalog.btrim(v_r.email, E' \t\n\r')) = pg_catalog.lower(v_email) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_owner_email';
    end if;
  end if;
  if p_user_id is not null then
    -- A-86: an Owner of THIS Organization, else not_found — a Manager included.
    select u.id, u.role, u.active, u.initials, u.email, u.passkey_enrolled_at into v_u
      from public.users u where u.id = p_user_id and u.org_id = p_org_id;
    if v_u.id is null or v_u.role <> 'owner' then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    -- M-04 d47: nothing to restore for someone already active — reachable only
    -- beside a replacement (the fake's refusal, fake/identity.ts:599).
    if v_u.active then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'active';
    end if;
    -- Read under the subject's lock (A-138): the PIN hash and the Store set.
    select p.pin_hash into v_hash from public.user_pins p where p.org_id = p_org_id and p.user_id = v_u.id;
    v_stores := app_internal.store_set(p_org_id, v_u.id);
    -- A-138 steps 4 and 5, S-01 d10: the clash is read under the Stores' lock.
    perform app_internal.lock_store_assignments(p_org_id, v_stores);
  end if;
  -- A-140, A-141: the System Administrator, after the last lock and the act's
  -- own refusals, before the first write.
  if not exists (select 1 from public.system_administrators a where a.auth_user_id = p_actor_user_id and a.active) then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;

  -- ── Writes ──
  if p_replace_user_id is not null then
    -- A-146, S-01 d11: deactivated first, as the fake does, so the replaced
    -- Owner's own initials and PIN clash with nothing below. M-04 d5: the row and
    -- its history kept. A-122: the hook refuses their next token. A-148: their
    -- enrolment window closes in the same write as active = false.
    update public.users u
       set active = false,
           enrolment_open_until = null,
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'deactivated',
                   'before', jsonb_build_object('active', true), 'after', jsonb_build_object('active', false)))
     where u.id = v_r.id and u.org_id = p_org_id;
    v_olog := jsonb_build_array(v_entry || jsonb_build_object('action', 'owner_replaced',
                'before', jsonb_build_object('user_id', v_r.id), 'after', null));
  end if;
  if p_user_id is not null then
    -- M-04 d19: the original row restored — same id, same history, same Stores.
    v_id := v_u.id;
    v_invite := v_u.passkey_enrolled_at is null;   -- A-117
    v_email := v_u.email;
    -- S-01 d10, M-04 d63: only the clashing value is cleared, not prompted for.
    v_initials := v_u.initials;
    if v_initials is not null and app_internal.initials_holder(p_org_id, v_stores, v_initials, v_u.id) is not null then
      v_initials := null;
    end if;
    v_pin_kept := v_hash is not null and app_internal.pin_taken(p_org_id, v_stores, v_hash, v_u.id) is null;
    if v_hash is not null and not v_pin_kept then
      delete from public.user_pins p where p.org_id = p_org_id and p.user_id = v_u.id;   -- A-137: cleared, never logged as a value
    end if;
    -- S-01 d9, d10: on the person, with the fields d10 may clear.
    v_ulog := jsonb_build_array(v_entry || jsonb_build_object('action', 'reactivated',
                'before', jsonb_build_object('active', false, 'initials', v_u.initials, 'pin_held', v_hash is not null),
                'after', jsonb_build_object('active', true, 'initials', v_initials, 'pin_held', v_pin_kept)));
    -- S-01 d14: an invite is logged on the person, after reactivated.
    if v_invite then
      v_ulog := v_ulog || jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent'));
    end if;
    -- A-131, A-148: a fresh window only when a link is sent; otherwise the column
    -- is left as it is — null since the deactivation closed it.
    update public.users u
       set active = true,
           initials = v_initials,
           log = u.log || v_ulog,
           enrolment_open_until = case when v_invite then pg_catalog.now() + interval '24 hours' else u.enrolment_open_until end
     where u.id = v_id and u.org_id = p_org_id;
  else
    -- S-01 d3: a new Owner, written as organization_create writes one — no
    -- initials, no Store; S-01 d14: invite_sent on them; A-131: their window.
    v_id := pg_catalog.gen_random_uuid();
    v_invite := true;
    insert into public.users (id, org_id, role, initials, display_name, email, log, enrolment_open_until)
    values (v_id, p_org_id, 'owner', null, v_name, v_email,
            jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent')),
            pg_catalog.now() + interval '24 hours');
  end if;
  -- A-146: owner_replaced names both people; S-01 d3, O-01 d5: on the
  -- Organization, where its Owners read it (the row lock is held since A-144's step).
  if p_replace_user_id is not null then
    v_olog := jsonb_build_array((v_olog -> 0) || jsonb_build_object('after', jsonb_build_object('user_id', v_id)));
  end if;
  v_olog := v_olog || jsonb_build_array(v_entry || jsonb_build_object(
              'action', case when p_user_id is not null then 'owner_reactivated' else 'owner_invited' end,
              'before', null, 'after', jsonb_build_object('user_id', v_id)));
  update public.organizations o
     set log = o.log || v_olog
   where o.id = p_org_id;
  -- A-146, M-04 d26: never below one active Owner at the commit. Unreachable by
  -- construction (one Owner was just made active); asserted so a later change
  -- that breaks it fails here, not in production.
  if app_internal.active_owner_count(p_org_id) < 1 then
    raise exception 'owner_floor' using errcode = '23514';
  end if;
  -- A-91: the Server Action sends the invite to this address after the commit.
  return jsonb_build_object('user_id', v_id, 'invite', v_invite, 'email', case when v_invite then v_email end);
end
$$;

-- A-103, A-107: user_change_role revoked from public and granted to authenticated
-- alone; A-90: the two S functions to the sysadmin role alone. (create or replace
-- keeps the grants already given; restated so this file stands alone.)
revoke execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)  from public;
grant  execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)  to authenticated;
revoke execute on function app.organization_create(uuid, uuid, text, text, text)                      from public;
grant  execute on function app.organization_create(uuid, uuid, text, text, text)                      to sysadmin;
revoke execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)                from public;
grant  execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)                to sysadmin;

reset role;
