set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- S-01 D M1, rework pass 3 — owner_recover and user_deactivate corrected (A-101:
-- 20261108223527 and 20261101130200 are merged and never edited; this follows
-- them). What changes, by Checklist row:
--
--   34  S-01 d15 — a replacement may not invite a new Owner at the replaced
--       Owner's own address: lower(btrim()) of both compared after the replaced
--       Owner is read under its lock, before the re-check and any write;
--       invalid_input / p_owner_email. A replacement by reactivation, and the
--       plain invite, are unaffected.
--   35  A-148 — a deactivation closes the person's enrolment window:
--       owner_recover's replacement and user_deactivate set
--       enrolment_open_until = null in the statement that sets active = false.
--       user_deactivate is otherwise the M-04 D order's function, unchanged in
--       every statement and refusal. A reactivation opens a window only when it
--       sends a link, as before (A-131).
--   36  conventions §5 (finding 16) — owner_recover's argument shapes: none of
--       p_user_id, a name and an email, or p_user_id with a name or an email, is
--       invalid_input / p_user_id; then, for a new Owner, a missing or blank name
--       is invalid_input / p_owner_name and a missing or blank email
--       email_required — as organization_create answers. Still before any read.
--
-- Unchanged: the signatures and grants (restated so this file reads complete),
-- A-113's header, A-138 / A-144's lock order, A-140's re-check, every other
-- refusal and its order, the log shapes.

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
    v_name := nullif(pg_catalog.btrim(p_owner_name), '');
    if v_name is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'p_owner_name';
    end if;
    v_email := nullif(pg_catalog.btrim(p_owner_email), '');
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
    if p_user_id is null and pg_catalog.lower(pg_catalog.btrim(v_r.email)) = pg_catalog.lower(v_email) then
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

-- ════════════════════════════════════════════════════════════════════════════
-- user_deactivate — M; O for a Manager or Owner (M-04 d30, d37, d54; A-148)
-- The M-04 D order's function (20261101130200), unchanged but for A-148's
-- column in its one write.
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
  v_h         jsonb;
  v_by_id     uuid;
  v_by_role   text;
  v_entry     jsonb;
  v_u         record;
  v_stores    uuid[];
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
  -- A-138 step 2: the active Owners, for the floor (M-04 d26).
  perform app_internal.lock_active_owners(v_org_id);
  -- A-138 step 3: the subject, before its state is read.
  select u.id, u.role, u.active into v_u
    from public.users u where u.id = p_user_id and u.org_id = v_org_id
     for no key update;
  if v_u.id is null then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  v_stores := app_internal.store_set(v_org_id, v_u.id);
  -- M-04 d30: a Manager or an Owner is touched by an Owner. M-04 d37: one shared Store is reach.
  if v_u.role <> 'employee' then
    if v_by_role <> 'owner' then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  elsif v_by_role <> 'owner' and not (v_stores && app_internal.store_set(v_org_id, v_by_id)) then
    raise exception 'role_refused' using errcode = '42501', detail = 'owner';
  end if;
  -- M-04 d54: nothing to deactivate for someone already deactivated; nothing is logged.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;
  -- M-04 d26: the floor, counted after the last lock (A-138).
  if v_u.role = 'owner' and app_internal.active_owner_count(v_org_id) <= 1 then
    raise exception 'owner_floor' using errcode = '23514';
  end if;
  -- A-140: the authoriser, after the last lock and after the floor.
  perform app_internal.authoriser_recheck(v_org_id, v_by_id, case when v_u.role = 'employee' then 'manager' else 'owner' end, v_stores, false);
  -- M-04 d15, d18: from the instant this commits, actor_resolve and every PIN
  -- resolution read the row as inactive. M-04 d5: deactivated, never deleted.
  -- A-148: the enrolment window closes in the same write, so a link sent before
  -- the deactivation opens no session after a later reactivation.
  update public.users u
     set active = false,
         enrolment_open_until = null,
         log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'deactivated',
                 'before', jsonb_build_object('active', true), 'after', jsonb_build_object('active', false)))
   where u.id = v_u.id and u.org_id = v_org_id;
  return jsonb_build_object('user_id', v_u.id);
end
$$;

-- A-103, A-90, A-107: owner_recover's execute revoked from public and granted to
-- the sysadmin role alone; user_deactivate's to authenticated alone. (create or
-- replace keeps the grants already given; restated so this file stands alone.)
revoke execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)  from public;
grant  execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)  to sysadmin;
revoke execute on function app.user_deactivate(uuid, text, uuid, uuid, text, uuid)      from public;
grant  execute on function app.user_deactivate(uuid, text, uuid, uuid, text, uuid)      to authenticated;

reset role;
