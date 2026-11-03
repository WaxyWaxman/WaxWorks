set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1, rework pass 4 — user_set_pin, replaced again (A-101:
-- 20261101140100 is merged and never edited), to:
--
--   Row 57, M-04 d62 (finding 51) — Set PIN refuses pin_required a PIN equal to
--     the one held when a Manager last set it, whether an Owner or the holder is
--     setting it, so a Manager-set PIN cannot become Owner-set or holder-set
--     without a digit changing. Compared as M-04 d61 compares, through
--     app_internal.pin_hash, with the held hash read under the subject's lock
--     (A-138 step 3); after the A-140 re-check, whose role decides whether the
--     setter acts as an Owner (d59); before any clash check. Nothing is written.
--     A Manager re-setting a Manager-set PIN to the same digits is unaffected:
--     it stays Manager-set.
--
-- Unchanged: the header, A-138's lock order, A-140's re-check and its place
-- (A-141), A-119's returned clash, every other refusal and its order, the log
-- shapes, the signature. The other nine stand as 20261101140100 and
-- 20261101130200 left them.

-- ════════════════════════════════════════════════════════════════════════════
-- user_set_pin — M (M-04 d41, d50)
-- ════════════════════════════════════════════════════════════════════════════
-- M-04 d51: every act that sets a PIN runs on a personal session, never at the
-- till, so this function has no store-session path: on any other principal it
-- refuses role_refused / person after the tenant and before the header.
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
  v_set_by    text;
  v_held      text;
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
  -- Read under the subject's lock: its Store set, and the PIN it holds and who
  -- last set it (M-04 d62 compares a new PIN with a Manager-set one).
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  select p.set_by, p.pin_hash into v_set_by, v_held from public.user_pins p where p.org_id = v_org_id and p.user_id = v_u.id;
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
  -- M-04 d62: a Manager-set PIN does not become Owner-set or holder-set without a
  -- digit changing. Set by the holder, or by an authoriser the re-check read as an
  -- Owner (d59), the same digits are refused as if no PIN were given — compared
  -- through the one keyed hash, before any clash check, and nothing is written.
  -- A Manager setting it (not the holder) is unaffected: it stays Manager-set.
  if v_set_by = 'manager' and (v_by_id = v_u.id or v_set_role = 'owner') and v_hash = v_held then
    raise exception 'pin_required' using errcode = '23502';
  end if;
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
revoke execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text) from public;
grant  execute on function app.user_set_pin(uuid, text, uuid, uuid, text, uuid, text) to authenticated;

reset role;
