set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1, review corrections — the internal helpers the identity functions
-- share, in app_internal (A-139), and app.manager_authorize_pin corrected to
-- resolve through the moved helper (A-101: 20261031040100 is merged and never
-- edited). The six helpers 20261031040100 created in `app` are dropped by
-- 20261101120200, once nothing calls them.
--
-- Internal: owned by waxworks_app, `execute` revoked from public and granted to
-- nobody, in a schema no session role holds `usage` on (20261101120000). None
-- is a header exception (A-113): none is reachable as an entry point.
--
-- What changed from the `app` copies, by review finding:
--   23 — pin_resolve compares through pin_hash, the one keyed hash, rather than
--        computing the HMAC inline beside it.
--    4 — lock_active_owners takes FOR NO KEY UPDATE (A-138), and no longer counts:
--        the count is active_owner_count, run after the function's last lock.
--   22 — pin_clash_refused: the returned pin_clash, its log entry and its status,
--        held once rather than four times.

-- ── app_internal.pin_hash — A-89, A-115, A-127 ─────────────────────────────
-- The hex HMAC-SHA-256 of the digits under the Vault pepper, read through the
-- one accessor, which raises pin_pepper_missing (XX000) when it is absent.
create or replace function app_internal.pin_hash(p_pin text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.encode(extensions.hmac(p_pin, authz.pin_pepper(), 'sha256'), 'hex')
$$;

-- ── app_internal.pin_resolve — the M / O header's PIN resolution ───────────
-- (§6, A-89, A-119; E-01 d26, d31, d38, d39; A-120, A-123.) The one active
-- Manager or Owner assigned to authz.store_id() holding this PIN, or a refusal,
-- under the Store's throttle, shared by the PIN pad and every M / O header
-- (E-01 d32). Unchanged in behaviour from app.pin_resolve (20261031040100).
--
-- Returns {user_id, display_name, role} on a match. A refusal the record must
-- keep is RETURNED — conventions §5's body, with response.status set — so the
-- caller's transaction commits the refusal row, the closure and the flag
-- (A-119). A caller passes a returned refusal upward at once.
-- Store session only: the callers assert the principal and the terminal first.
-- Lock order (A-138 step 1): the Store's PIN-line advisory lock is taken only on
-- the refusal path, which returns at once — before any other lock is taken.
create or replace function app_internal.pin_resolve(
  p_pin           text,
  p_terminal_id   uuid,
  p_request_id    uuid,
  p_staff_user_id uuid     -- A-120: the staff session's verified actor, or null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_org_id     uuid := authz.org_id();
  v_store_id   uuid := authz.store_id();
  v_hash       text;
  v_holder     record;
  v_closure    record;
  v_count      int;
  v_closure_id uuid;
  v_refused    constant jsonb := jsonb_build_object('code', '28P01', 'message', 'pin_refused', 'details', null, 'hint', null);
begin
  -- A-129, again here so the helper is safe by itself: nothing below can keep
  -- its record in a read-only transaction. Every caller has already asserted it.
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;

  -- A-115, A-127: fail closed without the pepper, whatever the PIN; the accessor raises.
  perform authz.pin_pepper();

  -- E-01 d38: a missing PIN tried no digits.
  if p_pin is null then
    perform pg_catalog.set_config('response.status', '403', true);
    return v_refused;
  end if;

  -- E-01 d31: while the line is closed, every PIN is refused. A success reads the
  -- closure without the lock (A-123).
  select c.id, c.reopens_at into v_closure
    from public.pin_line_closures c
   where c.org_id = v_org_id and c.store_id = v_store_id and c.reopens_at > pg_catalog.now()
   order by c.reopens_at desc
   limit 1;

  if v_closure.id is null then
    -- E-01 d26, A-89: THE one active Manager or Owner assigned here holding it,
    -- read at the moment of the call (A-55, A-122). `strict`: two holders raise
    -- too_many_rows (P0003) rather than naming whichever row came first.
    v_hash := app_internal.pin_hash(p_pin);    -- finding 23: the one keyed hash
    begin
      select u.id, u.display_name, u.role
        into strict v_holder
        from public.users u
        join public.store_assignments a
          on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
        join public.user_pins p
          on p.org_id = u.org_id and p.user_id = u.id
       where u.org_id = v_org_id
         and u.active
         and u.role in ('manager', 'owner')
         and p.pin_hash = v_hash;
      return jsonb_build_object('user_id', v_holder.id, 'display_name', v_holder.display_name, 'role', v_holder.role);
    exception
      when no_data_found then
        null;   -- nobody holds it: a refusal, below
    end;
  end if;

  -- A refusal. A-123: serialize the Store's refusals, then look again.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pin_line:' || v_store_id::text, 0));

  select c.id, c.reopens_at into v_closure
    from public.pin_line_closures c
   where c.org_id = v_org_id and c.store_id = v_store_id and c.reopens_at > pg_catalog.now()
   order by c.reopens_at desc
   limit 1;

  if v_closure.id is not null then
    -- E-01 d38: recorded, not counted, carrying the open closure.
    insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, counted, closure_id, request_id, principal)
    values (v_org_id, v_store_id, p_terminal_id, p_staff_user_id, false, v_closure.id, p_request_id, 'store');
    perform pg_catalog.set_config('response.status', '400', true);
    return jsonb_build_object('code', 'WX429', 'message', 'pin_line_closed',
                              'details', to_jsonb(v_closure.reopens_at), 'hint', null);
  end if;

  insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, counted, closure_id, request_id, principal)
  values (v_org_id, v_store_id, p_terminal_id, p_staff_user_id, true, null, p_request_id, 'store');

  select count(*) into v_count
    from public.pin_refusals r
   where r.org_id = v_org_id and r.store_id = v_store_id
     and r.counted and r.closure_id is null
     and r.at > pg_catalog.now() - interval '15 minutes';

  if v_count >= 5 then
    insert into public.pin_line_closures (org_id, store_id, closed_at, reopens_at, terminal_id, request_id, principal)
    values (v_org_id, v_store_id, pg_catalog.now(), pg_catalog.now() + interval '15 minutes', p_terminal_id, p_request_id, 'store')
    returning id into v_closure_id;

    -- The closure spends the five (E-01 d38, A-123).
    update public.pin_refusals r
       set closure_id = v_closure_id
     where r.org_id = v_org_id and r.store_id = v_store_id
       and r.counted and r.closure_id is null
       and r.at > pg_catalog.now() - interval '15 minutes';

    -- The system's flag, no actor (A-68, E-01 d39); its subject is the closure (A-123).
    insert into public.review_flags (org_id, store_id, kind, subject_type, subject_id, actor_user_id, context,
                                     request_id, terminal_id, principal)
    values (v_org_id, v_store_id, 'pin_line_closed', 'pin_line_closure', v_closure_id, null,
            jsonb_build_object('refusals', v_count), p_request_id, p_terminal_id, 'store');
  end if;

  perform pg_catalog.set_config('response.status', '403', true);
  return v_refused;
end
$$;

-- ── app_internal.lock_active_owners — A-138 step 2; M-04 d26 ───────────────
-- The Organization's active Owner rows FOR NO KEY UPDATE in id order. It does
-- not count: the floor is counted by active_owner_count after the function's
-- last lock (A-138), and two Owners demoting each other at once serialize here.
-- NO KEY UPDATE, not UPDATE: role and active are not key columns, and the
-- KEY SHARE a foreign-key insert naming an Owner takes is left unblocked.
create or replace function app_internal.lock_active_owners(p_org_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.users u
   where u.org_id = p_org_id and u.role = 'owner' and u.active
   order by u.id
     for no key update;
end
$$;

-- ── app_internal.active_owner_count — M-04 d26 ─────────────────────────────
-- The floor's count. Called only after lock_active_owners, and after every
-- other lock the caller takes (A-138); the structural suite holds both.
create or replace function app_internal.active_owner_count(p_org_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.users u
   where u.org_id = p_org_id and u.role = 'owner' and u.active
$$;

-- ── app_internal.lock_store_assignments — A-138 steps 4 and 5; §5.1 ────────
-- The lock under which initials and PIN uniqueness are checked (M-04 d13, d27,
-- d28): the Stores' own rows FOR NO KEY UPDATE in id order — so a Store with no
-- assignment yet still serializes two callers — then their assignment rows
-- FOR UPDATE in key order (A-38's ordering).
create or replace function app_internal.lock_store_assignments(p_org_id uuid, p_store_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.stores s
   where s.org_id = p_org_id and s.id = any(p_store_ids)
   order by s.id
     for no key update;
  perform 1 from public.store_assignments a
   where a.org_id = p_org_id and a.store_id = any(p_store_ids)
   order by a.org_id, a.user_id, a.store_id
     for update;
end
$$;

-- ── app_internal.initials_holder — M-04 d13, d16, d27; E-01 d25 ────────────
-- The name of an ACTIVE User assigned to one of these Stores holding these
-- (normalised) initials, other than p_except — or null. Called under the lock.
create or replace function app_internal.initials_holder(p_org_id uuid, p_store_ids uuid[], p_initials text, p_except uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select u.display_name
    from public.store_assignments a
    join public.users u on u.org_id = a.org_id and u.id = a.user_id
   where a.org_id = p_org_id
     and a.store_id = any(p_store_ids)
     and u.active
     and u.initials = p_initials
     and u.id is distinct from p_except
   order by pg_catalog.array_position(p_store_ids, a.store_id), u.id
   limit 1
$$;

-- ── app_internal.pin_taken — E-01 d26; M-04 d28, d32 ───────────────────────
-- The first of these Stores (in the order given) where another active Manager
-- or Owner assigned there holds this hash — or null. Called under the lock.
-- Returns a Store, never a person: a PIN clash names nobody (M-04 d32).
create or replace function app_internal.pin_taken(p_org_id uuid, p_store_ids uuid[], p_pin_hash text, p_except uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select a.store_id
    from public.store_assignments a
    join public.users u on u.org_id = a.org_id and u.id = a.user_id
    join public.user_pins p on p.org_id = u.org_id and p.user_id = u.id
   where a.org_id = p_org_id
     and a.store_id = any(p_store_ids)
     and u.active
     and u.role in ('manager', 'owner')
     and u.id is distinct from p_except
     and p.pin_hash = p_pin_hash
   order by pg_catalog.array_position(p_store_ids, a.store_id)
   limit 1
$$;

-- ── app_internal.pin_clash_refused — M-04 d32, d40; A-119, A-121 ───────────
-- A refused PIN clash at Set PIN, Assign, a promotion or a reactivation: the
-- subject's users.log gains pin_clash_refused — the caller's entry (actor,
-- authoriser, time, A-94's columns) and the Store, never a digit or a holder —
-- and conventions §5's body is returned with HTTP 409, so the caller returns it
-- and the transaction commits the entry and nothing else.
create or replace function app_internal.pin_clash_refused(p_org_id uuid, p_user_id uuid, p_entry jsonb, p_store_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.users u
     set log = u.log || jsonb_build_array(p_entry || jsonb_build_object('action', 'pin_clash_refused', 'store_id', p_store_id))
   where u.id = p_user_id and u.org_id = p_org_id;
  perform pg_catalog.set_config('response.status', '409', true);
  return jsonb_build_object('code', '23505', 'message', 'pin_clash', 'details', null, 'hint', null);
end
$$;

revoke execute on function app_internal.pin_hash(text)                                  from public;   -- A-103, A-107
revoke execute on function app_internal.pin_resolve(text, uuid, uuid, uuid)             from public;
revoke execute on function app_internal.lock_active_owners(uuid)                        from public;
revoke execute on function app_internal.active_owner_count(uuid)                        from public;
revoke execute on function app_internal.lock_store_assignments(uuid, uuid[])            from public;
revoke execute on function app_internal.initials_holder(uuid, uuid[], text, uuid)       from public;
revoke execute on function app_internal.pin_taken(uuid, uuid[], text, uuid)             from public;
revoke execute on function app_internal.pin_clash_refused(uuid, uuid, jsonb, uuid)      from public;
-- No grant: internal to the definer functions, which run as waxworks_app (A-139).

-- ── app.manager_authorize_pin, corrected again (A-101) ─────────────────────
-- Its header is unchanged from 20261031040100; the resolution is now
-- app_internal.pin_resolve (A-139). Its pgTAP (0021, 0025) and tests/auth cases
-- are unedited.
create or replace function app.manager_authorize_pin(
  p_pin            text,
  p_terminal_id    uuid,
  p_request_id     uuid,
  p_actor_user_id  uuid default null,   -- A-120: the open staff session, null together
  p_actor_initials text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id   uuid := authz.org_id();
  v_store_id uuid := authz.store_id();
begin
  -- Header, in A-103's order: tenant, principal and actor, terminal.
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';                       -- A-40
  end if;
  if authz.principal() is distinct from 'store' then
    raise exception 'role_refused' using errcode = '42501', detail = 'store';  -- E-01 d27: no PIN on a personal session
  end if;
  -- A-120's half pair: conventions §5's note - invalid_input, 22023, the detail
  -- naming the argument that is missing. Refused before anything is read or written.
  if p_actor_user_id is not null and p_actor_initials is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_actor_initials';
  end if;
  if p_actor_user_id is null and p_actor_initials is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_actor_user_id';
  end if;
  -- A-103 (kept by A-113 for the exceptions): the actor before the terminal.
  if p_actor_user_id is not null and not exists (
       select 1 from public.users u
         join public.store_assignments a
           on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
        where u.id = p_actor_user_id
          and u.org_id = v_org_id
          and u.active
          and u.initials = pg_catalog.upper(pg_catalog.btrim(p_actor_initials))) then
    raise exception 'actor_mismatch' using errcode = '28000';                  -- A-120: neither counts nor is recorded
  end if;
  if not exists (select 1 from public.terminals t
                  where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
    raise exception 'terminal_mismatch' using errcode = '28000';               -- A-94
  end if;

  -- A-129: a read-only transaction (PostgREST's GET and HEAD) could name a
  -- holder but never keep a refusal's record, so it is refused before the
  -- pepper is read or any PIN compared. Raised: nothing could commit anyway.
  if pg_catalog.current_setting('transaction_read_only') <> 'off' then
    raise exception 'read_only' using errcode = '25006';
  end if;

  -- E-01 d26, d31, d38, d39: the resolution and its throttle, returned as is.
  return app_internal.pin_resolve(p_pin, p_terminal_id, p_request_id, p_actor_user_id);
end
$$;

revoke execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) from public;   -- A-103, A-107
grant  execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) to authenticated;

reset role;
