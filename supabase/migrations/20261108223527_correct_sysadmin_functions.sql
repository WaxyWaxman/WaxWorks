set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- S-01 D M1, rework pass 2 — the three S functions corrected (A-101: the merged
-- 20261103223945 is never edited; this follows it). The header (A-113), the
-- grants (A-90, A-107) and every refusal raised, never returned (row 13), are
-- as there. What changes, by Checklist row:
--
--   27  A-144, S-01 d12 — owner_recover and owner_reset_request lock the
--       Organization's row (FOR NO KEY UPDATE) after the header and before A-138
--       step 2; their organizations.log append re-takes a lock already held.
--       organization_create takes none (its row does not exist before the insert).
--   28  conventions §5 (finding 4) — organization_create's three text arguments,
--       and owner_recover's new Owner's two, are trimmed; a blank name is
--       invalid_input naming it, a missing email email_required; the trimmed
--       values are stored.
--   29  S-01 d10, M-04 d63 — a reactivated Owner keeps their Stores; initials an
--       active person at one of them now holds, and a PIN an active Manager or
--       Owner there now holds, are cleared — read through app_internal's
--       initials_holder and pin_taken, under A-138 steps 4 and 5 — and the
--       reactivated entry carries initials and pin_held before and after.
--   30  S-01 d11, A-146 — p_replace_user_id: an active Owner of the Organization,
--       deactivated in the same transaction as the restoration; both subjects
--       locked in id order (step 3); the Organization never below one active
--       Owner at the commit, asserted after the writes.
--   31  S-01 d14 — every invite owner_recover sends is logged invite_sent on the
--       person, after reactivated where both occur.
--
-- owner_recover gains an argument, so the old signature is dropped and the new
-- one created (a second overload would leave PostgREST two candidates). Its
-- grants are re-made below; the other two keep theirs through create or replace
-- and are restated so this file reads complete.

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
  v_name := nullif(pg_catalog.btrim(p_name), '');
  if v_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_name';
  end if;
  v_owner_name := nullif(pg_catalog.btrim(p_owner_name), '');
  if v_owner_name is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_owner_name';
  end if;
  -- A-117: invite implies email — the first Owner is invited, so has an address.
  v_email := nullif(pg_catalog.btrim(p_owner_email), '');
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
-- owner_recover — S (A-90, A-144, A-146; S-01 d3, d9, d10, d11, d12, d14;
-- M-04 d19, d26, d63)
-- Either p_user_id (a deactivated Owner to reactivate) or a new Owner's name and
-- email; both or neither is invalid_input / p_user_id (conventions §5). With
-- p_replace_user_id, the active Owner named there is deactivated in the same act
-- (A-146); without it, refused while an active Owner exists.
-- ════════════════════════════════════════════════════════════════════════════
drop function app.owner_recover(uuid, uuid, uuid, uuid, text, text);

create function app.owner_recover(
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
  if (p_user_id is null) is distinct from (p_owner_name is not null and p_owner_email is not null) then
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
    select u.id, u.role, u.active into v_r
      from public.users u where u.id = p_replace_user_id and u.org_id = p_org_id;
    if v_r.id is null or v_r.role <> 'owner' then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
    if not v_r.active then
      raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
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
    -- its history kept. A-122: the hook refuses their next token.
    update public.users u
       set active = false,
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
    update public.users u
       set active = true,
           initials = v_initials,
           log = u.log || v_ulog,
           enrolment_open_until = case when v_invite then pg_catalog.now() + interval '24 hours' else u.enrolment_open_until end   -- A-131
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
-- owner_reset_request — S (A-90, A-114, A-144; S-01 d3, d8, d12; M-04 d38)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.owner_reset_request(
  p_actor_user_id uuid,
  p_request_id    uuid,
  p_org_id        uuid,
  p_user_id       uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_u     record;
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

  -- ── Body ──
  -- A-144, S-01 d12: the Organization's row, after the header and before step 3;
  -- the organizations.log append below re-takes it. A-86: unknown → not_found.
  perform 1 from public.organizations o where o.id = p_org_id for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- A-138 step 3: the subject, read under its lock. An Owner of this
  -- Organization with an email, else not_found (fake/identity.ts:645).
  select u.id, u.role, u.active, u.email into v_u
    from public.users u where u.id = p_user_id and u.org_id = p_org_id
     for no key update;
  if v_u.id is null or v_u.role <> 'owner' or coalesce(v_u.email, '') = '' then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- S-01 d8: a reset link to a deactivated Owner is refused; the screen offers
  -- reactivation first. After not_found, before the window and any entry.
  if not v_u.active then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'inactive';
  end if;
  -- A-140, A-141: the System Administrator, after the last lock and the act's own
  -- refusals, before the first write.
  if not exists (select 1 from public.system_administrators a where a.auth_user_id = p_actor_user_id and a.active) then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;

  -- ── Writes ── A-93: *link sent*, never the link. A-131: the window opens with the log.
  update public.users u
     set log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reset_link_sent')),
         enrolment_open_until = pg_catalog.now() + interval '24 hours'
   where u.id = v_u.id and u.org_id = p_org_id;
  -- S-01 d3, O-01 d5: on the Organization, where its Owners read it.
  update public.organizations o
     set log = o.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reset_link_sent',
                 'before', null, 'after', jsonb_build_object('user_id', v_u.id)))
   where o.id = p_org_id;
  -- A-91: the Server Action sends the re-enrolment link to this address after the commit.
  return jsonb_build_object('user_id', v_u.id, 'email', v_u.email);
end
$$;

-- A-103, A-90, A-107: execute revoked from public and granted to the sysadmin
-- role alone — not to authenticated, anon or service_role.
revoke execute on function app.organization_create(uuid, uuid, text, text, text)        from public;
revoke execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)  from public;
revoke execute on function app.owner_reset_request(uuid, uuid, uuid, uuid)              from public;
grant  execute on function app.organization_create(uuid, uuid, text, text, text)        to sysadmin;
grant  execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text, uuid)  to sysadmin;
grant  execute on function app.owner_reset_request(uuid, uuid, uuid, uuid)              to sysadmin;

reset role;
