set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1 — the internal helpers the ten user-administration functions share,
-- and app.manager_authorize_pin corrected to resolve its PIN through the same
-- helper (A-101: 20261031030100 is merged and never edited).
--
-- Internal: each is owned by waxworks_app, `execute` revoked from public and
-- granted to nobody, so no session can call one; the definer functions that
-- call them run as waxworks_app (A-104). None is a header exception (A-113):
-- none is reachable as an entry point.

-- ── app.pin_hash — A-89, A-115, A-127 ──────────────────────────────────────
-- The hex HMAC-SHA-256 of the digits under the Vault pepper, read through the
-- one accessor, which raises pin_pepper_missing (XX000) when it is absent.
create or replace function app.pin_hash(p_pin text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.encode(extensions.hmac(p_pin, authz.pin_pepper(), 'sha256'), 'hex')
$$;

-- ── app.pin_resolve — the M / O header's PIN resolution (§6, A-89, A-119) ──
-- The one active Manager or Owner assigned to authz.store_id() holding this PIN,
-- or a refusal, under E-01's per-Store throttle (d31, d38, d39; A-120, A-123).
-- Moved here unchanged from manager_authorize_pin (20261031030100), so the PIN
-- pad and every M / O function count toward one limit (E-01 d32).
--
-- Returns {user_id, display_name, role} on a match. A refusal the record must
-- keep is RETURNED — conventions §5's body, with response.status set — so the
-- caller's transaction commits the refusal row, the closure and the flag
-- (A-119). A caller passes a returned refusal upward at once, never swallowing
-- it (A-119: "one helper every M / O header calls and the suite asserts").
-- Store session only: the callers assert the principal and the terminal first.
create or replace function app.pin_resolve(
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
  v_pepper     text;
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

  -- A-115, A-127: fail closed without the pepper; the accessor raises.
  v_pepper := authz.pin_pepper();

  -- E-01 d38: a missing PIN tried no digits.
  if p_pin is null then
    perform set_config('response.status', '403', true);
    return v_refused;
  end if;

  -- E-01 d31: while the line is closed, every PIN is refused. A success reads the
  -- closure without the lock (A-123).
  select c.id, c.reopens_at into v_closure
    from public.pin_line_closures c
   where c.org_id = v_org_id and c.store_id = v_store_id and c.reopens_at > now()
   order by c.reopens_at desc
   limit 1;

  if v_closure.id is null then
    -- E-01 d26, A-89: THE one active Manager or Owner assigned here holding it,
    -- read at the moment of the call (A-55, A-122). `strict`: two holders raise
    -- too_many_rows (P0003) rather than naming whichever row came first.
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
         and p.pin_hash = encode(extensions.hmac(p_pin, v_pepper, 'sha256'), 'hex');
      return jsonb_build_object('user_id', v_holder.id, 'display_name', v_holder.display_name, 'role', v_holder.role);
    exception
      when no_data_found then
        null;   -- nobody holds it: a refusal, below
    end;
  end if;

  -- A refusal. A-123: serialize the Store's refusals, then look again.
  perform pg_advisory_xact_lock(hashtextextended('pin_line:' || v_store_id::text, 0));

  select c.id, c.reopens_at into v_closure
    from public.pin_line_closures c
   where c.org_id = v_org_id and c.store_id = v_store_id and c.reopens_at > now()
   order by c.reopens_at desc
   limit 1;

  if v_closure.id is not null then
    -- E-01 d38: recorded, not counted, carrying the open closure.
    insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, counted, closure_id, request_id, principal)
    values (v_org_id, v_store_id, p_terminal_id, p_staff_user_id, false, v_closure.id, p_request_id, 'store');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('code', 'WX429', 'message', 'pin_line_closed',
                              'details', to_jsonb(v_closure.reopens_at), 'hint', null);
  end if;

  insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, counted, closure_id, request_id, principal)
  values (v_org_id, v_store_id, p_terminal_id, p_staff_user_id, true, null, p_request_id, 'store');

  select count(*) into v_count
    from public.pin_refusals r
   where r.org_id = v_org_id and r.store_id = v_store_id
     and r.counted and r.closure_id is null
     and r.at > now() - interval '15 minutes';

  if v_count >= 5 then
    insert into public.pin_line_closures (org_id, store_id, closed_at, reopens_at, terminal_id, request_id, principal)
    values (v_org_id, v_store_id, now(), now() + interval '15 minutes', p_terminal_id, p_request_id, 'store')
    returning id into v_closure_id;

    -- The closure spends the five (E-01 d38, A-123).
    update public.pin_refusals r
       set closure_id = v_closure_id
     where r.org_id = v_org_id and r.store_id = v_store_id
       and r.counted and r.closure_id is null
       and r.at > now() - interval '15 minutes';

    -- The system's flag, no actor (A-68, E-01 d39); its subject is the closure (A-123).
    insert into public.review_flags (org_id, store_id, kind, subject_type, subject_id, actor_user_id, context,
                                     request_id, terminal_id, principal)
    values (v_org_id, v_store_id, 'pin_line_closed', 'pin_line_closure', v_closure_id, null,
            jsonb_build_object('refusals', v_count), p_request_id, p_terminal_id, 'store');
  end if;

  perform set_config('response.status', '403', true);
  return v_refused;
end
$$;

-- ── app.lock_store_assignments — A-89, §5.1 (M-04 d13, d27, d28) ───────────
-- The lock under which initials and PIN uniqueness are checked: the Stores'
-- assignment rows FOR UPDATE in key order (A-38's ordering). The Store rows are
-- taken first, FOR NO KEY UPDATE in id order, so that a Store with no assignment
-- yet still serializes two callers — a lock on zero rows holds nothing. NO KEY
-- UPDATE does not conflict with the KEY SHARE a foreign-key insert takes, so a
-- PIN refusal or a terminal at that Store does not wait on it.
create or replace function app.lock_store_assignments(p_org_id uuid, p_store_ids uuid[])
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

-- ── app.lock_active_owners — M-04 d26, A-89, §5.1 ──────────────────────────
-- The Organization's active Owner rows FOR UPDATE in key order, then the count
-- under the lock: two Owners demoting each other at once cannot both read two.
create or replace function app.lock_active_owners(p_org_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  perform 1 from public.users u
   where u.org_id = p_org_id and u.role = 'owner' and u.active
   order by u.id
     for update;
  select count(*) into v_count
    from public.users u
   where u.org_id = p_org_id and u.role = 'owner' and u.active;
  return v_count;
end
$$;

-- ── app.initials_holder — M-04 d13, d16, d27; E-01 d25 ─────────────────────
-- The name of an ACTIVE User assigned to one of these Stores holding these
-- (normalised) initials, other than p_except — or null. Called under the lock.
create or replace function app.initials_holder(p_org_id uuid, p_store_ids uuid[], p_initials text, p_except uuid)
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

-- ── app.pin_taken — E-01 d26; M-04 d28, d32 ────────────────────────────────
-- The first of these Stores (in the order given) where another active Manager
-- or Owner assigned there holds this hash — or null. Called under the lock.
-- Returns a Store, never a person: a PIN clash names nobody (M-04 d32).
create or replace function app.pin_taken(p_org_id uuid, p_store_ids uuid[], p_pin_hash text, p_except uuid)
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

revoke execute on function app.pin_hash(text)                                from public;   -- A-103, A-107
revoke execute on function app.pin_resolve(text, uuid, uuid, uuid)           from public;
revoke execute on function app.lock_store_assignments(uuid, uuid[])          from public;
revoke execute on function app.lock_active_owners(uuid)                      from public;
revoke execute on function app.initials_holder(uuid, uuid[], text, uuid)     from public;
revoke execute on function app.pin_taken(uuid, uuid[], text, uuid)           from public;
-- No grant: internal to the definer functions, which run as waxworks_app.

-- ── app.manager_authorize_pin, corrected (A-101) ───────────────────────────
-- Its header is unchanged from 20261031030100; the resolution after the
-- read-only guard is now app.pin_resolve, the same code moved, so the PIN pad
-- and every M / O header are one throttle (E-01 d32) and one copy (the M-04 D
-- order's Scope). Its pgTAP (0021, 0025) and tests/auth cases are unedited.
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
          and u.initials = upper(btrim(p_actor_initials))) then
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
  return app.pin_resolve(p_pin, p_terminal_id, p_request_id, p_actor_user_id);
end
$$;

revoke execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) from public;   -- A-103, A-107
grant  execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) to authenticated;

reset role;
