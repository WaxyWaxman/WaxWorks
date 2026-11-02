set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1, rework pass 2 — four more internal helpers in app_internal (A-139),
-- which 20261101130200 redefines the ten user-administration functions to call:
--
--   header             — row 54 (finding 21): A-103's header, held once.
--   authoriser_recheck — row 53, A-140: the authoriser re-checked after the last lock.
--   store_set          — row 47 (finding 28): every read of a person's Stores, so
--                        one structural assertion catches each, whatever its alias.
--   pin_setter         — row 49, M-04 d55: who set a PIN, by role.
--
-- Internal, as 20261101120100's eight: owned by waxworks_app, run as their
-- caller (the definer function, so waxworks_app), `execute` revoked from public
-- and granted to nobody, in a schema no session role holds `usage` on.

-- ── app_internal.store_set — a person's Stores (M-04 d27; A-138) ───────────
-- The Stores one person in this Organization is assigned to, in id order. Takes
-- no lock: a caller reading its subject's Stores calls it after A-138 step 3
-- (the subject's FOR NO KEY UPDATE), under which the set cannot change.
create or replace function app_internal.store_set(p_org_id uuid, p_user_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(a.store_id order by a.store_id), '{}')
    from public.store_assignments a
   where a.org_id = p_org_id and a.user_id = p_user_id
$$;

-- ── app_internal.pin_setter — M-04 d55 ─────────────────────────────────────
-- Who sets a PIN, by role, as user_pins.set_by records it: the holder setting
-- their own, whatever their role; otherwise the setter's role — an Owner, or a
-- Manager. A PIN a Manager set does not carry into Owner standing (M-04 d55).
create or replace function app_internal.pin_setter(p_by_id uuid, p_by_role text, p_user_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_by_id = p_user_id then 'holder'
              when p_by_role = 'owner'  then 'owner'
              else 'manager' end
$$;

-- ── app_internal.header — A-103's header, held once (row 54, finding 21) ────
-- The ten user-administration functions call this first, after only their own
-- tenant check and M-04 d51's and d58's till refusals (which come before any
-- actor is read). In A-103's order: the tenant; the principal and the actor;
-- the terminal (A-94); A-129's guard; then, on a store session, the PIN
-- resolution (§6, A-89) — whose refusal is RETURNED at once, so the caller
-- returns it at once and the transaction commits its record (A-119).
--
-- Returns that refusal, or the call's who-and-where:
--   {actor_user_id, actor_role, by_user_id, by_role, principal, terminal_id,
--    entry}
-- where by_* is the authoriser — the PIN's holder on a store session, the
-- session holder on a personal one (M-04 d31) — and entry is the users.log
-- entry's columns every act appends (A-94; M-04 d4: both names).
create or replace function app_internal.header(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_request_id     uuid,
  p_terminal_id    uuid,
  p_manager_pin    text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_org_id     uuid := authz.org_id();
  v_store_id   uuid := authz.store_id();
  v_principal  text := authz.principal();
  v_actor_id   uuid;
  v_actor_role text;
  v_terminal   uuid;
  v_auth       jsonb;
  v_by_id      uuid;
  v_by_role    text;
begin
  -- Tenant (A-40, A-90): an enrolment session (A-117) has none.
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';
  end if;
  -- Principal and actor (§6, A-113): on a personal session the session holder,
  -- an active Manager or Owner, given no initials; on a store session the person
  -- the initials name, active and assigned to this Store.
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
       and u.initials = pg_catalog.upper(pg_catalog.btrim(p_actor_initials));
    if v_actor_id is null then
      raise exception 'actor_mismatch' using errcode = '28000';
    end if;
  else
    raise exception 'role_refused' using errcode = '42501', detail = 'person';
  end if;
  -- The terminal, on a store session (A-94).
  if v_principal = 'store' then
    if not exists (select 1 from public.terminals t
                    where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
      raise exception 'terminal_mismatch' using errcode = '28000';
    end if;
    v_terminal := p_terminal_id;
  end if;
  -- A-129: nothing below could keep its record in a read-only transaction.
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;
  -- M / O (§6, A-89; E-01 d26, d31, d38, d39): the PIN on a store session, under
  -- the Store's throttle; the session itself on a personal one (E-01 d27).
  if v_principal = 'store' then
    v_auth := app_internal.pin_resolve(p_manager_pin, p_terminal_id, p_request_id, v_actor_id);
    if v_auth ? 'code' then
      return v_auth;
    end if;
    v_by_id := (v_auth ->> 'user_id')::uuid;
    v_by_role := v_auth ->> 'role';
  else
    v_by_id := v_actor_id;
    v_by_role := v_actor_role;
  end if;
  return jsonb_build_object(
    'actor_user_id', v_actor_id, 'actor_role', v_actor_role,
    'by_user_id', v_by_id, 'by_role', v_by_role,
    'principal', v_principal, 'terminal_id', v_terminal,
    'entry', jsonb_build_object('at', pg_catalog.now(), 'actor_user_id', v_actor_id, 'manager_user_id', v_by_id,
                                'request_id', p_request_id, 'terminal_id', v_terminal, 'principal', v_principal));
end
$$;

-- ── app_internal.authoriser_recheck — A-140 (row 53, finding 24) ───────────
-- After the last A-138 step a function takes, the person who authorised the act
-- is read again: still active, still of the role the act requires (p_role:
-- 'owner' for an Owner-only act, 'manager' for one a Manager may do), and, for a
-- Manager, still holding the reach the act depends on — sharing one of p_reach's
-- Stores (M-04 d37, d41), or holding every one of them when p_every (a Manager's
-- own Stores, M-04 d30). Refused role_refused before anything is written: the
-- detail is the role the act requires, or `owner` where only reach was lost, as
-- each function's own reach check refuses (conventions §5).
--
-- Takes no lock (A-140: "a final step … that takes no lock"). Under READ
-- COMMITTED this statement's snapshot is taken after the caller's last lock was
-- granted, so a demotion that committed while the caller waited is seen here.
-- Where the caller took A-138 step 2 for an Owner-only act, the authoriser's own
-- row was among those it locked, or was skipped there for no longer matching.
create or replace function app_internal.authoriser_recheck(
  p_org_id uuid,
  p_by_id  uuid,
  p_role   text,
  p_reach  uuid[]  default null,
  p_every  boolean default false
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_role   text;
  v_active boolean;
  v_held   uuid[];
begin
  select u.role, u.active into v_role, v_active
    from public.users u where u.id = p_by_id and u.org_id = p_org_id;
  if not coalesce(v_active, false)
     or (v_role is distinct from 'owner' and (p_role = 'owner' or v_role is distinct from 'manager')) then
    raise exception 'role_refused' using errcode = '42501', detail = p_role;
  end if;
  if v_role = 'manager' and p_reach is not null then
    v_held := app_internal.store_set(p_org_id, p_by_id);
    if (p_every and not (p_reach <@ v_held)) or (not p_every and not (p_reach && v_held)) then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  end if;
end
$$;

revoke execute on function app_internal.store_set(uuid, uuid)                                    from public;   -- A-103, A-107
revoke execute on function app_internal.pin_setter(uuid, text, uuid)                             from public;
revoke execute on function app_internal.header(uuid, text, uuid, uuid, text)                     from public;
revoke execute on function app_internal.authoriser_recheck(uuid, uuid, text, uuid[], boolean)    from public;
-- No grant: internal to the definer functions, which run as waxworks_app (A-139).

reset role;
