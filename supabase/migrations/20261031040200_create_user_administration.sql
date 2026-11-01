set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1 — the ten Identity functions that administer the people of one
-- Organization (§6 Identity; A-55, A-89, A-114), built to the contract at
-- 5ea9522 and its fake (packages/contracts/src/fake/identity.ts), whose
-- refusal order they follow.
--
-- Every one opens with A-103's header, in its order:
--   1. tenant — authz.org_id() is not null (A-40);
--   2. principal and actor — on a personal session the actor IS the session
--      holder, an active Manager or Owner, and gives no initials (§6, A-122); on a
--      store session the actor is the active User assigned to this Store whose
--      normalised initials were given (E-01 d25, M-04 d20);
--   3. terminal — on a store session it belongs to authz.store_id() (A-94);
--   4. A-129's guard — a read-only transaction is refused before any PIN is read;
--   5. M / O — on a store session the PIN resolves through app.pin_resolve to the
--      one active Manager or Owner assigned here, under E-01's throttle, and a
--      returned refusal is passed upward at once (A-89, A-119, E-01 d32); on a
--      personal session the session holder authorises (M-04 d31). An O function
--      then asks whether that person is an Owner, refused by name (§6).
-- Every users.log entry carries the actor, the authoriser, the time, and A-94's
-- request id, terminal (null on a personal session) and principal.
--
-- A refusal the record must keep is returned, not raised (A-119, A-121): the PIN
-- resolution's, and pin_clash at Set PIN, Assign, a promotion and a
-- reactivation, which first appends pin_clash_refused to the subject's log
-- (M-04 d32). Everything else is raised with conventions §5's key and SQLSTATE.
-- A PIN is never logged and never in a refusal (A-93).

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
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
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
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  -- Arguments the database itself rejects (conventions §5's note).
  if p_role is null or p_role not in ('employee', 'manager', 'owner') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_role';
  end if;
  v_name := nullif(btrim(p_display_name), '');
  if v_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_display_name';
  end if;
  -- M-04 d30: creating a Manager or an Owner is Owner-only.
  if p_role <> 'employee' and v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- Each Store is this Organization's (A-86), and a Manager adds at their own (M-04 d30).
  foreach v_store in array coalesce(p_store_ids, '{}') loop
    if v_store is null or not exists (select 1 from public.stores s where s.id = v_store and s.org_id = v_org_id) then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if v_by_role <> 'owner' and not exists (select 1 from public.store_assignments a
                                             where a.org_id = v_org_id and a.user_id = v_by_id and a.store_id = v_store) then
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
  v_initials := nullif(upper(btrim(p_initials)), '');
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
  v_email := nullif(btrim(p_email), '');
  if p_role <> 'employee' and v_email is null then
    raise exception 'email_required' using errcode = '23502';
  end if;
  -- A-89: exactly four digits.
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
  end if;

  -- §5.1: under the Stores' assignment lock, initials then the PIN, Store by Store.
  perform app.lock_store_assignments(v_org_id, v_stores);
  if p_pin is not null then
    v_hash := app.pin_hash(p_pin);
  end if;
  foreach v_store in array v_stores loop
    v_holder := app.initials_holder(v_org_id, array[v_store], v_initials, null);
    if v_holder is not null then
      raise exception 'initials_clash' using errcode = '23505', detail = v_holder;   -- M-04 d13: naming the holder
    end if;
    -- M-04 d32's note: a clash at Add is raised and unlogged — no row to log against.
    if v_hash is not null and app.pin_taken(v_org_id, array[v_store], v_hash, null) is not null then
      raise exception 'pin_clash' using errcode = '23505';
    end if;
  end loop;

  -- ── Writes ──
  v_invite := p_role <> 'employee';                                              -- M-04 d29
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
          case when v_invite then now() + interval '24 hours' end)               -- A-131: same transaction as the log
  returning id into v_id;
  insert into public.store_assignments (org_id, user_id, store_id)
  select v_org_id, v_id, x from unnest(v_stores) x;
  if v_hash is not null then
    insert into public.user_pins (org_id, user_id, pin_hash) values (v_org_id, v_id, v_hash);
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
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_email     text;
  v_holds     boolean;
  v_hash      text;
  v_clash     uuid;
  v_promotion boolean;
  v_invite    boolean;
  v_before    jsonb;
  v_after     jsonb;
  v_log       jsonb := '[]';
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  -- O (§6, M-04 d30): is this an Owner — refused by name.
  if v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  if p_role is null or p_role not in ('employee', 'manager', 'owner') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_role';
  end if;
  select u.id, u.role, u.email, u.active, u.passkey_enrolled_at into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
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
  -- M-04 d26: the floor, counted under the Owners' lock.
  if v_u.role = 'owner' and app.lock_active_owners(v_org_id) <= 1 then
    raise exception 'owner_floor' using errcode = '23514';
  end if;
  v_stores := array(select a.store_id from public.store_assignments a
                     where a.org_id = v_org_id and a.user_id = v_u.id order by a.store_id);
  -- M-04 d27: an Employee or a Manager holds a Store; a demotion is a door to that state.
  if p_role <> 'owner' and cardinality(v_stores) = 0 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'no_store';
  end if;
  v_email := coalesce(nullif(btrim(p_email), ''), v_u.email);
  -- M-04 d39: a demotion sent with a PIN is refused as Add refuses one.
  if p_role = 'employee' and p_pin is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  if p_role <> 'employee' then
    -- M-04 d33: the role change requires the email.
    if v_email is null then
      raise exception 'email_required' using errcode = '23502';
    end if;
    -- M-04 d35: into Manager, or an Owner holding a Store, needs a PIN if none is held.
    v_holds := exists (select 1 from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id);
    if not v_holds and p_pin is null and (p_role = 'manager' or cardinality(v_stores) > 0) then
      raise exception 'pin_required' using errcode = '23502';
    end if;
    if p_pin is not null then
      if p_pin !~ '^[0-9]{4}$' then
        raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
      end if;
      -- §5.1: the clash at every Store of the holder, under the assignment lock.
      perform app.lock_store_assignments(v_org_id, v_stores);
      v_hash := app.pin_hash(p_pin);
      v_clash := app.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
      if v_clash is not null then
        -- M-04 d32, A-119: logged on the subject, then returned so the log commits.
        update public.users u
           set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_clash_refused', 'store_id', v_clash))
         where u.id = v_u.id;
        perform set_config('response.status', '409', true);
        return jsonb_build_object('code', '23505', 'message', 'pin_clash', 'details', null, 'hint', null);
      end if;
    end if;
  end if;

  -- ── Writes ──
  -- M-04 d43, A-117: any promotion invites while the person has never enrolled.
  v_invite := v_promotion and v_u.passkey_enrolled_at is null;
  -- M-04 d42: a changed email is logged before and after.
  if v_email is distinct from v_u.email then
    v_before := jsonb_build_object('role', v_u.role, 'email', v_u.email);
    v_after := jsonb_build_object('role', p_role, 'email', v_email);
  else
    v_before := jsonb_build_object('role', v_u.role);
    v_after := jsonb_build_object('role', p_role);
  end if;
  if v_hash is not null then
    insert into public.user_pins (org_id, user_id, pin_hash) values (v_org_id, v_u.id, v_hash)
      on conflict (user_id) do update set pin_hash = excluded.pin_hash;
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'));
  end if;
  -- M-04 d39: a demotion to Employee clears the PIN, logged as cleared.
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
         enrolment_open_until = case when v_invite then now() + interval '24 hours' else u.enrolment_open_until end   -- A-131
   where u.id = v_u.id;
  -- A-118: the Server Action sends the invite to the address returned here.
  return jsonb_build_object('user_id', v_u.id, 'invite', v_invite, 'email', case when v_invite then v_email end);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_deactivate — M; O for a Manager or Owner (M-04 d30, d37)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_deactivate(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.active into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d30: a Manager or an Owner is touched by an Owner. M-04 d37: one shared Store is reach.
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not exists (
          select 1 from public.store_assignments s
            join public.store_assignments m on m.org_id = s.org_id and m.store_id = s.store_id and m.user_id = v_by_id
           where s.org_id = v_org_id and s.user_id = v_u.id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d26: the floor, counted under the Owners' lock.
  if v_u.role = 'owner' and v_u.active and app.lock_active_owners(v_org_id) <= 1 then
    raise exception 'owner_floor' using errcode = '23514';
  end if;
  -- M-04 d15, d18: from the instant this commits, actor_resolve and every PIN
  -- resolution read the row as inactive. M-04 d5: deactivated, never deleted.
  update public.users u
     set active = false,
         log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'deactivated',
                 'before', jsonb_build_object('active', v_u.active), 'after', jsonb_build_object('active', false)))
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_reactivate — M; O for a Manager or Owner (M-04 d19, d30, d37, d40, d47)
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
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
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
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.active, u.initials into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- In reach (M-04 d30, d37).
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not exists (
          select 1 from public.store_assignments s
            join public.store_assignments m on m.org_id = s.org_id and m.store_id = s.store_id and m.user_id = v_by_id
           where s.org_id = v_org_id and s.user_id = v_u.id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d47: nothing to restore for someone already active.
  if v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'active';
  end if;
  v_stores := array(select a.store_id from public.store_assignments a
                     where a.org_id = v_org_id and a.user_id = v_u.id order by a.store_id);
  -- §5.1: initials and PIN are checked under the Stores' assignment lock.
  perform app.lock_store_assignments(v_org_id, v_stores);
  -- M-04 d19: reused initials are refused naming the holder, and the screen asks for new ones.
  v_initials := coalesce(nullif(upper(btrim(p_initials)), ''), v_u.initials);
  if v_initials is not null then
    foreach v_store in array v_stores loop
      v_holder := app.initials_holder(v_org_id, array[v_store], v_initials, v_u.id);
      if v_holder is not null then
        raise exception 'initials_clash' using errcode = '23505', detail = v_holder;
      end if;
    end loop;
  end if;
  -- M-04 d28: Employees have no PIN.
  if v_u.role = 'employee' and p_pin is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  select p.pin_hash into v_old from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
  if p_pin is not null then
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
    end if;
    -- M-04 d47, d49: a new PIN only where the old one clashes; otherwise Set PIN changes it.
    if v_old is null or app.pin_taken(v_org_id, v_stores, v_old, v_u.id) is null then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'pin_not_needed';
    end if;
    v_fresh := app.pin_hash(p_pin);
  end if;
  v_hash := coalesce(v_fresh, v_old);
  -- M-04 d40: the PIN stays unique at each Store — refused unnamed and logged (d32, A-121).
  if v_u.role <> 'employee' and v_hash is not null then
    v_clash := app.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
    if v_clash is not null then
      update public.users u
         set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_clash_refused', 'store_id', v_clash))
       where u.id = v_u.id;
      perform set_config('response.status', '409', true);
      return jsonb_build_object('code', '23505', 'message', 'pin_clash', 'details', null, 'hint', null);
    end if;
  end if;

  -- ── Writes ──
  -- M-04 d19: the original row, restored.
  if v_fresh is not null then
    insert into public.user_pins (org_id, user_id, pin_hash) values (v_org_id, v_u.id, v_fresh)
      on conflict (user_id) do update set pin_hash = excluded.pin_hash;
    v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'));      -- never the value
  end if;
  v_log := v_log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reactivated',
             'before', jsonb_build_object('active', v_u.active, 'initials', v_u.initials),
             'after', jsonb_build_object('active', true, 'initials', v_initials)));
  update public.users u
     set active = true, initials = v_initials, log = u.log || v_log
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_assign — M; O for a Manager or Owner (M-04 d27, d30, d32, d34, d35)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_assign(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_store_id       uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_holder    text;
  v_hash      text;
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.initials into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  if p_store_id is null or not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org_id) then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d30: reassigning a Manager or Owner is Owner-only; a Manager assigns at their own Stores.
  if v_u.role <> 'employee' and v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  if v_by_role <> 'owner' and not exists (select 1 from public.store_assignments a
                                           where a.org_id = v_org_id and a.user_id = v_by_id and a.store_id = p_store_id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  if exists (select 1 from public.store_assignments a
              where a.org_id = v_org_id and a.user_id = v_u.id and a.store_id = p_store_id) then
    return jsonb_build_object('user_id', v_u.id);   -- already assigned: nothing to write
  end if;
  -- M-04 d34: assignment requires initials. M-04 d35: and a Manager's or Owner's PIN.
  if v_u.initials is null then
    raise exception 'initials_required' using errcode = '23502';
  end if;
  select p.pin_hash into v_hash from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
  if v_u.role <> 'employee' and v_hash is null then
    raise exception 'pin_required' using errcode = '23502';
  end if;
  -- §5.1: under the Store's assignment lock, initials then the PIN.
  perform app.lock_store_assignments(v_org_id, array[p_store_id]);
  v_holder := app.initials_holder(v_org_id, array[p_store_id], v_u.initials, v_u.id);
  if v_holder is not null then
    raise exception 'initials_clash' using errcode = '23505', detail = v_holder;   -- M-04 d27: naming the holder
  end if;
  if v_u.role <> 'employee' and app.pin_taken(v_org_id, array[p_store_id], v_hash, v_u.id) is not null then
    -- M-04 d32, A-119: unnamed, logged on the subject, returned so the log commits.
    update public.users u
       set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_clash_refused', 'store_id', p_store_id))
     where u.id = v_u.id;
    perform set_config('response.status', '409', true);
    return jsonb_build_object('code', '23505', 'message', 'pin_clash', 'details', null, 'hint', null);
  end if;

  -- ── Writes ──
  insert into public.store_assignments (org_id, user_id, store_id) values (v_org_id, v_u.id, p_store_id);
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'assigned', 'store_id', p_store_id))
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_unassign — M; O for a Manager or Owner (M-04 d27, d30)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_unassign(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null,
  p_store_id       uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  if p_store_id is null or not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org_id) then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d30 (and d37: unassignment stays at the Manager's own Stores).
  if v_u.role <> 'employee' and v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  if v_by_role <> 'owner' and not exists (select 1 from public.store_assignments a
                                           where a.org_id = v_org_id and a.user_id = v_by_id and a.store_id = p_store_id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- The count of the person's Stores is taken under the lock of their assignment
  -- rows, so two unassignments at once cannot both leave one (M-04 d27).
  v_stores := array(select a.store_id from public.store_assignments a
                     where a.org_id = v_org_id and a.user_id = v_u.id order by a.store_id);
  perform app.lock_store_assignments(v_org_id, v_stores);
  if not exists (select 1 from public.store_assignments a
                  where a.org_id = v_org_id and a.user_id = v_u.id and a.store_id = p_store_id) then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d27: an Employee's or a Manager's last Store; an Owner may hold none.
  if v_u.role <> 'owner' and (select count(*) from public.store_assignments a
                               where a.org_id = v_org_id and a.user_id = v_u.id) <= 1 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'last_store';
  end if;

  -- ── Writes ──
  delete from public.store_assignments a
   where a.org_id = v_org_id and a.user_id = v_u.id and a.store_id = p_store_id;
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'unassigned', 'store_id', p_store_id))
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_correct — M (M-04 d22, d30, d37); a Manager or Owner is corrected by an Owner
-- Each field is optional and an omitted one is unchanged (the contract). For
-- p_email a null CLEARS the address, so its default is a value no caller sends.
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
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
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
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.initials, u.display_name, u.email into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- In reach (M-04 d30, d37).
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not exists (
          select 1 from public.store_assignments s
            join public.store_assignments m on m.org_id = s.org_id and m.store_id = s.store_id and m.user_id = v_by_id
           where s.org_id = v_org_id and s.user_id = v_u.id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  v_initials := v_u.initials;
  v_name := v_u.display_name;
  v_email := v_u.email;
  v_stores := array(select a.store_id from public.store_assignments a
                     where a.org_id = v_org_id and a.user_id = v_u.id order by a.store_id);
  -- §5.1: corrected initials are checked under the Stores' assignment lock.
  perform app.lock_store_assignments(v_org_id, v_stores);
  if p_initials is not null then
    v_initials := nullif(upper(btrim(p_initials)), '');                                 -- M-04 d20
    if v_initials is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_initials';
    end if;
    foreach v_store in array v_stores loop
      v_holder := app.initials_holder(v_org_id, array[v_store], v_initials, v_u.id);
      if v_holder is not null then
        raise exception 'initials_clash' using errcode = '23505', detail = v_holder;   -- M-04 d13: naming the holder
      end if;
    end loop;
  end if;
  if p_display_name is not null then
    v_name := nullif(btrim(p_display_name), '');
    if v_name is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_display_name';
    end if;
  end if;
  if p_email is distinct from '(unchanged)' then
    v_email := nullif(btrim(p_email), '');
    -- M-04 d29, d33: a Manager's or Owner's invite and re-enrolment need the address.
    if v_email is null and v_u.role <> 'employee' then
      raise exception 'email_required' using errcode = '23502';
    end if;
  end if;

  -- ── Writes ── (A-55: before and after)
  update public.users u
     set initials = v_initials, display_name = v_name, email = v_email,
         log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'corrected',
                 'before', jsonb_build_object('initials', v_u.initials, 'display_name', v_u.display_name, 'email', v_u.email),
                 'after', jsonb_build_object('initials', v_initials, 'display_name', v_name, 'email', v_email)))
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_set_pin — M (M-04 d28, d35, d41, d48)
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
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
  v_hash      text;
  v_clash     uuid;
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.active into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- M-04 d28: Employees have no PIN.
  if v_u.role = 'employee' then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee_has_no_pin';
  end if;
  -- M-04 d41: a Manager sets the PIN of anyone who shares any one of their Stores.
  if v_by_role <> 'owner' and not exists (
       select 1 from public.store_assignments s
         join public.store_assignments m on m.org_id = s.org_id and m.store_id = s.store_id and m.user_id = v_by_id
        where s.org_id = v_org_id and s.user_id = v_u.id) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d48: nothing is done to a deactivated person's standing; reactivate first.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;
  v_stores := array(select a.store_id from public.store_assignments a
                     where a.org_id = v_org_id and a.user_id = v_u.id order by a.store_id);
  if p_pin is null then
    -- M-04 d35: a Manager or Owner who holds a Store holds a PIN.
    if cardinality(v_stores) > 0 then
      raise exception 'pin_required' using errcode = '23502';
    end if;
    delete from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
    update public.users u
       set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_cleared'))
     where u.id = v_u.id;
    return jsonb_build_object('user_id', v_u.id);
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_pin';
  end if;
  -- §5.1, M-04 d28: unique at every Store of the holder, under the assignment lock.
  perform app.lock_store_assignments(v_org_id, v_stores);
  v_hash := app.pin_hash(p_pin);
  v_clash := app.pin_taken(v_org_id, v_stores, v_hash, v_u.id);
  if v_clash is not null then
    -- M-04 d32, A-119: unnamed, logged on the subject, returned so the log commits.
    update public.users u
       set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_clash_refused', 'store_id', v_clash))
     where u.id = v_u.id;
    perform set_config('response.status', '409', true);
    return jsonb_build_object('code', '23505', 'message', 'pin_clash', 'details', null, 'hint', null);
  end if;

  -- ── Writes ── (M-04 d28: logged as changed, never as a value)
  insert into public.user_pins (org_id, user_id, pin_hash) values (v_org_id, v_u.id, v_hash)
    on conflict (user_id) do update set pin_hash = excluded.pin_hash;
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'pin_set'))
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_reset_request — O (A-114; M-04 d29, d38, d44)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_reset_request(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  -- O (§6, A-114): is this an Owner — refused by name.
  if v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.active, u.email into v_u from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- A-114: to a Manager or Owner.
  if v_u.role = 'employee' then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee';
  end if;
  -- M-04 d44: no link reaches a deactivated person; reactivate first.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;

  -- ── Writes ── A-93: *link sent*, never the link. A-131: the window opens with the log.
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reset_link_sent')),
         enrolment_open_until = now() + interval '24 hours'
   where u.id = v_u.id;
  -- A-91: the Server Action sends the link to this address after the commit.
  return jsonb_build_object('user_id', v_u.id, 'email', v_u.email);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- user_invite_resend — O (A-114, A-117; M-04 d33, d44)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.user_invite_resend(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid default null,
  p_manager_pin    text default null,
  p_user_id        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid := authz.org_id();
  v_store_id  uuid := authz.store_id();
  v_principal text := authz.principal();
  v_actor_id  uuid;
  v_actor_role text;
  v_terminal  uuid;
  v_auth      jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
begin
  -- ── Header (A-103) ──
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  if v_principal = 'person' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
     where u.id = p_actor_user_id and u.id = authz.user_id() and u.org_id = v_org_id
       and u.active and u.role in ('manager', 'owner');
    if v_actor_id is null or p_actor_initials is not null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  elsif v_principal = 'store' then
    select u.id, u.role into v_actor_id, v_actor_role from public.users u
      join public.store_assignments a on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
     where u.id = p_actor_user_id and u.org_id = v_org_id and u.active
       and u.initials = upper(btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  if v_principal = 'store' then
    v_auth := app.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  -- O (§6, A-114): is this an Owner — refused by name.
  if v_by_role <> 'owner' then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  v_entry := jsonb_build_object('at', now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal);

  -- ── Body ──
  select u.id, u.role, u.active, u.email, u.passkey_enrolled_at into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  if v_u.role = 'employee' then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'employee';      -- A-114
  end if;
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';      -- M-04 d44
  end if;
  -- A-117: Re-send invite is for someone who never accepted.
  if v_u.passkey_enrolled_at is not null then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'enrolled';
  end if;

  -- ── Writes ── A-93: *invite sent*, never the link. A-131: the window opens with the log.
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent')),
         enrolment_open_until = now() + interval '24 hours'
   where u.id = v_u.id;
  return jsonb_build_object('user_id', v_u.id, 'email', v_u.email);
end
$$;

-- A-103, A-107: revoked from public, granted to authenticated alone.
revoke execute on function app.user_add(uuid, text, uuid, uuid, text, text, text, text, text, uuid[], text)   from public;
revoke execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)        from public;
revoke execute on function app.user_deactivate(uuid, text, uuid, uuid, text, uuid)                           from public;
revoke execute on function app.user_reactivate(uuid, text, uuid, uuid, text, uuid, text, text)               from public;
revoke execute on function app.user_assign(uuid, text, uuid, uuid, text, uuid, uuid)                         from public;
revoke execute on function app.user_unassign(uuid, text, uuid, uuid, text, uuid, uuid)                       from public;
revoke execute on function app.user_correct(uuid, text, uuid, uuid, text, uuid, text, text, text)            from public;
revoke execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text)                        from public;
revoke execute on function app.user_reset_request(uuid, text, uuid, uuid, text, uuid)                        from public;
revoke execute on function app.user_invite_resend(uuid, text, uuid, uuid, text, uuid)                        from public;
grant  execute on function app.user_add(uuid, text, uuid, uuid, text, text, text, text, text, uuid[], text)   to authenticated;
grant  execute on function app.user_change_role(uuid, text, uuid, uuid, text, uuid, text, text, text)        to authenticated;
grant  execute on function app.user_deactivate(uuid, text, uuid, uuid, text, uuid)                           to authenticated;
grant  execute on function app.user_reactivate(uuid, text, uuid, uuid, text, uuid, text, text)               to authenticated;
grant  execute on function app.user_assign(uuid, text, uuid, uuid, text, uuid, uuid)                         to authenticated;
grant  execute on function app.user_unassign(uuid, text, uuid, uuid, text, uuid, uuid)                       to authenticated;
grant  execute on function app.user_correct(uuid, text, uuid, uuid, text, uuid, text, text, text)            to authenticated;
grant  execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text)                        to authenticated;
grant  execute on function app.user_reset_request(uuid, text, uuid, uuid, text, uuid)                        to authenticated;
grant  execute on function app.user_invite_resend(uuid, text, uuid, uuid, text, uuid)                        to authenticated;

reset role;
