set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- app.manager_authorize_pin — §6 Identity; A-89, A-113, A-115, A-119, A-120, A-123, A-127;
-- E-01 d26, d31, d32, d38, d39.
--
-- The PIN pad's own check (E-01 d32): returns the one ACTIVE Manager or Owner
-- assigned to authz.store_id() holding this PIN, or refuses naming nobody.
-- Store session only. Its refusals count toward the Store's five in fifteen
-- minutes (E-01 d31); the M / O write path's PIN resolution (M-04 D) counts on
-- the same rows.
--
-- A-119: pin_refused and pin_line_closed are RETURNED, not raised, so the
-- refusal row — and at the fifth the closure and its flag — commit. Every
-- other refusal (header, pepper) is raised and writes nothing.
--
-- E-01 d38's edges, in order:
--   * a missing PIN is refused pin_refused and writes nothing, counted or not;
--   * while the line is closed every attempt is refused pin_line_closed with
--     reopens_at, recorded counted = false with the open closure's id;
--   * a correct PIN clears nothing — the count is the window's refusals;
--   * the fifth counted, unclaimed refusal of the window closes the line and
--     the closure claims the five (A-123), so the line reopens with none.
-- A-123's concurrency: a refusal takes a per-Store transaction advisory lock
-- before it rechecks the line, recounts and writes; a success takes none.
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
  v_pepper   text;
  v_holder   record;
  v_closure  record;
  v_count    int;
  v_closure_id uuid;
  v_refused  constant jsonb := jsonb_build_object('code', '28P01', 'message', 'pin_refused', 'details', null, 'hint', null);
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
  if not exists (select 1 from public.terminals t
                  where t.id = p_terminal_id and t.org_id = v_org_id and t.store_id = v_store_id) then
    raise exception 'terminal_mismatch' using errcode = '28000';               -- A-94
  end if;
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
    -- E-01 d26: the one active Manager or Owner assigned here holding it.
    select u.id, u.display_name, u.role
      into v_holder
      from public.users u
      join public.store_assignments a
        on a.org_id = u.org_id and a.user_id = u.id and a.store_id = v_store_id
      join public.user_pins p
        on p.org_id = u.org_id and p.user_id = u.id
     where u.org_id = v_org_id
       and u.active
       and u.role in ('manager', 'owner')
       and p.pin_hash = encode(extensions.hmac(p_pin, v_pepper, 'sha256'), 'hex');
    if found then
      return jsonb_build_object('user_id', v_holder.id, 'display_name', v_holder.display_name, 'role', v_holder.role);
    end if;
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
    values (v_org_id, v_store_id, p_terminal_id, p_actor_user_id, false, v_closure.id, p_request_id, 'store');
    perform set_config('response.status', '400', true);
    return jsonb_build_object('code', 'WX429', 'message', 'pin_line_closed',
                              'details', to_jsonb(v_closure.reopens_at), 'hint', null);
  end if;

  insert into public.pin_refusals (org_id, store_id, terminal_id, staff_user_id, counted, closure_id, request_id, principal)
  values (v_org_id, v_store_id, p_terminal_id, p_actor_user_id, true, null, p_request_id, 'store');

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

revoke execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) from public;   -- A-103
grant  execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) to authenticated;

reset role;
