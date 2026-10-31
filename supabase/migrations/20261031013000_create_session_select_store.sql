set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- app.session_select_store — §6 Identity; A-87; E-01 d27, d36.
-- Personal session only. The pick is a write: refused where the person is not
-- assigned unless an active Owner, recorded at users.selected_store_id, which
-- the access-token hook copies into the next token. A null p_store_id changes
-- nothing and reports (E-01 d36). Logged on users.log with A-94's columns; the
-- terminal is null on a personal session.
create or replace function app.session_select_store(
  p_actor_user_id  uuid,
  p_actor_initials text,
  p_terminal_id    uuid,
  p_request_id     uuid,
  p_store_id       uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := authz.org_id();
  v_me     record;
  v_stores jsonb;
begin
  if v_org_id is null then
    raise exception 'no_tenant' using errcode = '28000';                        -- A-40
  end if;
  if authz.principal() is distinct from 'person' then
    raise exception 'role_refused' using errcode = '42501', detail = 'person';  -- E-01 d27
  end if;
  -- §6: on a personal session the actor IS the session holder, active, and a
  -- Manager or Owner (A-122); initials are never read there.
  select u.id, u.role, u.selected_store_id
    into v_me
    from public.users u
   where u.id = p_actor_user_id
     and u.id = authz.user_id()
     and u.org_id = v_org_id
     and u.active
     and u.role in ('manager', 'owner')
     for update;
  if not found or p_actor_initials is not null then
    raise exception 'actor_mismatch' using errcode = '28000';
  end if;

  if p_store_id is not null then
    if not exists (select 1 from public.stores s where s.id = p_store_id and s.org_id = v_org_id) then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if not exists (
         select 1 from public.stores s
          where s.id = p_store_id and s.org_id = v_org_id and s.active
            and (v_me.role = 'owner'
                 or exists (select 1 from public.store_assignments a
                             where a.org_id = v_org_id and a.user_id = v_me.id and a.store_id = s.id))) then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner'; -- E-01 d27
    end if;

    update public.users u
       set selected_store_id = p_store_id,
           log = u.log || jsonb_build_array(jsonb_build_object(
             'action', 'store_selected', 'at', now(),
             'actor_user_id', v_me.id, 'manager_user_id', v_me.id,
             'before', v_me.selected_store_id, 'after', p_store_id,
             'request_id', p_request_id, 'terminal_id', null, 'principal', 'person'))   -- A-94
     where u.id = v_me.id;
    v_me.selected_store_id := p_store_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('store_id', s.id, 'trading_name', s.trading_name)
                            order by s.trading_name, s.id), '[]'::jsonb)
    into v_stores
    from public.stores s
   where s.org_id = v_org_id and s.active
     and (v_me.role = 'owner'
          or exists (select 1 from public.store_assignments a
                      where a.org_id = v_org_id and a.user_id = v_me.id and a.store_id = s.id));

  return jsonb_build_object('selected_store_id', v_me.selected_store_id, 'stores', v_stores);
end
$$;

revoke execute on function app.session_select_store(uuid, text, uuid, uuid, uuid) from public;   -- A-103
grant  execute on function app.session_select_store(uuid, text, uuid, uuid, uuid) to authenticated;

reset role;
