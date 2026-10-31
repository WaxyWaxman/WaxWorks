set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- Corrects app.manager_authorize_pin (20261031012900, merged; A-101: never edited).
-- From the E-01 D order's review:
--   Finding 1, A-129: refuses a read-only transaction — PostgREST runs an RPC
--     called by GET or HEAD read-only — with `read_only` / 25006, after the
--     header and before the pepper is read or any PIN compared. Without it a
--     correct PIN named its holder over GET while a wrong one could write no
--     refusal: an untraced PIN oracle. manager_authorize_pin is the only
--     function on A-119's list (as amended by A-121) that exists yet: the M / O
--     PIN resolution and the PIN-clash checks are the M-04 D order's, which
--     must carry the same guard (A-129).
--   Finding 8, A-89: `select … into strict`, so a PIN held twice at a Store
--     raises instead of naming an arbitrary holder.
--   Finding 10, A-103: the staff-session actor is verified before the terminal,
--     A-103's order, which A-113 keeps for the header exceptions.
-- Everything else is unchanged from 20261031012900.
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
    -- E-01 d26, A-89: THE one active Manager or Owner assigned here holding it.
    -- `strict`: two holders (M-04's uniqueness broken) raise too_many_rows
    -- (P0003) rather than naming whichever row came first.
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

revoke execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) from public;   -- A-103, A-107
grant  execute on function app.manager_authorize_pin(text, uuid, uuid, uuid, text) to authenticated;

reset role;
