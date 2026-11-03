set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- S-01 D M1 — the three S functions of architecture §6's Identity row:
-- organization_create, owner_recover, owner_reset_request (A-90, A-113).
--
-- What they share (A-113): no tenant, no initials, no terminal, no PIN. Each
-- takes p_actor_user_id (the System Administrator's Auth user id, A-110) and
-- p_request_id, and in place of the tenant assertion asserts, in the fake's
-- order (packages/contracts/src/fake/identity.ts, `sysadmin()`):
--   1. authz.principal() = 'sysadmin'                      — else role_refused / sysadmin
--   2. p_actor_user_id = auth.uid(), the JWT's sub         — else actor_mismatch
--   3. an active system_administrators row for that id     — else role_refused / sysadmin
-- The sub is read from request.jwt.claims directly, the setting auth.uid()
-- itself reads: waxworks_app holds no usage on `auth` (conventions §3.3).
-- The row is read under waxworks_app's own select (A-125); no grant is added.
--
-- The header is written out in each of the three rather than factored into an
-- app_internal helper (the order's Scope leaves it to the developer): it is
-- three statements, and app_internal's helper list is held exactly by 0033.
--
-- Every refusal is RAISED (the order's row 13): no S function records a
-- refusal, so A-119 and A-129 do not bind and a refused call commits nothing.
--
-- Every log entry carries the System Administrator's auth_user_id as its actor
-- (A-90, A-110), the request id, a null terminal and principal 'sysadmin'
-- (A-94), in the shape users.log entries already take (O-01 d5).
--
-- A-114, A-91: each authorises and logs the Auth act and returns the address;
-- the invite or link is the Server Action's, after the commit, and no entry
-- carries a link (A-93). A-131: each act that sends a link opens the person's
-- 24-hour window in the same transaction as its log entry.
--
-- Locks (A-138, A-140): organization_create takes none — nothing it touches
-- exists before it — so its header read is its re-check. owner_recover takes
-- step 2 (the Organization's active Owner rows) and, to reactivate, step 3 (the
-- subject); owner_reset_request takes step 3. Neither locks the Organization's
-- row (S-01 d3's note, 2026-11-03: two concurrent recoveries may both invite).
-- After its last lock each re-reads the System Administrator's row, after the
-- act's own refusals and before the first write (A-140's *Read by* note of
-- 2026-11-03; A-141).

-- ════════════════════════════════════════════════════════════════════════════
-- organization_create — S (A-90; S-01 d2, d5)
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
  v_entry  jsonb;
  v_org_id uuid := pg_catalog.gen_random_uuid();
  v_owner  uuid := pg_catalog.gen_random_uuid();
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

  -- ── Writes ──
  -- A-86, A-135: the tenant's root; its id is its tenant key. S-01 d3, O-01 d5:
  -- logged where its Owners read it.
  insert into public.organizations (id, name, log)
  values (v_org_id, p_name,
          jsonb_build_array(v_entry || jsonb_build_object('action', 'organization_created', 'before', null,
                                                          'after', jsonb_build_object('name', p_name, 'owner_user_id', v_owner))));
  -- S-01 d2, d5; M-04 d27, d34: the first Owner — a name and an email, no
  -- initials, no Store. A-114: the invite logged, never sent here (A-91).
  -- A-131: the window opens with the log entry.
  insert into public.users (id, org_id, role, initials, display_name, email, log, enrolment_open_until)
  values (v_owner, v_org_id, 'owner', null, p_owner_name, p_owner_email,
          jsonb_build_array(v_entry || jsonb_build_object('action', 'invite_sent')),
          pg_catalog.now() + interval '24 hours');
  return jsonb_build_object('org_id', v_org_id, 'owner_user_id', v_owner);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- owner_recover — S (A-90; S-01 d3, d9; M-04 d19, d26)
-- Either p_user_id (a deactivated Owner to reactivate) or a new Owner's name and
-- email; both or neither is invalid_input / p_user_id (conventions §5; the
-- contract's refine, owner_recover.ts).
-- ════════════════════════════════════════════════════════════════════════════
create or replace function app.owner_recover(
  p_actor_user_id uuid,
  p_request_id    uuid,
  p_org_id        uuid,
  p_user_id       uuid default null,
  p_owner_name    text default null,
  p_owner_email   text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry  jsonb;
  v_u      record;
  v_id     uuid;
  v_invite boolean;
  v_email  text;
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

  -- ── Body ──
  -- A-86: an unknown Organization. No lock on its row (S-01 d3's note).
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- A-138 step 2: the Organization's active Owner rows, then the count under the
  -- lock. A-90: refused while an active Owner exists — before the subject is
  -- read (fake/identity.ts:578).
  perform app_internal.lock_active_owners(p_org_id);
  if app_internal.active_owner_count(p_org_id) > 0 then
    raise exception 'invalid_state' using errcode = 'WX409', detail = 'active_owner';
  end if;
  if p_user_id is not null then
    -- A-138 step 3: the subject, read under its lock. A-86: an Owner of THIS
    -- Organization, else not_found — a Manager included (fake/identity.ts:584).
    select u.id, u.role, u.active, u.initials, u.email, u.passkey_enrolled_at into v_u
      from public.users u where u.id = p_user_id and u.org_id = p_org_id
       for no key update;
    if v_u.id is null or v_u.role <> 'owner' then
      raise exception 'not_found' using errcode = 'WX404';
    end if;
  end if;
  -- A-140, A-141: the System Administrator, after the last lock and the act's
  -- own refusals, before the first write.
  if not exists (select 1 from public.system_administrators a where a.auth_user_id = p_actor_user_id and a.active) then
    raise exception 'role_refused' using errcode = '42501', detail = 'sysadmin';
  end if;

  -- ── Writes ──
  if p_user_id is not null then
    -- M-04 d19: the original row restored — same id, same history. A-117: an
    -- invite only for an Owner who never enrolled; A-131: their window with it.
    v_id := v_u.id;
    v_invite := v_u.passkey_enrolled_at is null;
    v_email := v_u.email;
    -- S-01 d9: logged on the person as well as on the Organization.
    update public.users u
       set active = true,
           log = u.log || jsonb_build_array(v_entry || jsonb_build_object('action', 'reactivated',
                   'before', jsonb_build_object('active', v_u.active, 'initials', v_u.initials),
                   'after', jsonb_build_object('active', true, 'initials', v_u.initials))),
           enrolment_open_until = case when v_invite then pg_catalog.now() + interval '24 hours' else u.enrolment_open_until end
     where u.id = v_id and u.org_id = p_org_id;
  else
    -- S-01 d3: a new Owner, written as organization_create writes one — no
    -- initials, no Store. A-131: the window opens with the Organization's log
    -- entry below. The fake logs the invite on the Organization only
    -- (fake/identity.ts:598).
    v_id := pg_catalog.gen_random_uuid();
    v_invite := true;
    v_email := p_owner_email;
    insert into public.users (id, org_id, role, initials, display_name, email, enrolment_open_until)
    values (v_id, p_org_id, 'owner', null, p_owner_name, p_owner_email, pg_catalog.now() + interval '24 hours');
  end if;
  -- S-01 d3, O-01 d5: on the Organization, where its Owners read it.
  update public.organizations o
     set log = o.log || jsonb_build_array(v_entry || jsonb_build_object(
                 'action', case when p_user_id is not null then 'owner_reactivated' else 'owner_invited' end,
                 'before', null, 'after', jsonb_build_object('user_id', v_id)))
   where o.id = p_org_id;
  -- A-91: the Server Action sends the invite to this address after the commit.
  return jsonb_build_object('user_id', v_id, 'invite', v_invite, 'email', case when v_invite then v_email end);
end
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- owner_reset_request — S (A-90, A-114; S-01 d3, d8; M-04 d38)
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
  -- A-86: an unknown Organization. No lock on its row.
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'not_found' using errcode = 'WX404';
  end if;
  -- A-138 step 3: the subject, read under its lock. An Owner of this
  -- Organization with an email, else not_found (fake/identity.ts:606-607).
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
  -- A-140, A-141: the System Administrator, after the lock and the act's own
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
revoke execute on function app.organization_create(uuid, uuid, text, text, text)       from public;
revoke execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text)       from public;
revoke execute on function app.owner_reset_request(uuid, uuid, uuid, uuid)             from public;
grant  execute on function app.organization_create(uuid, uuid, text, text, text)       to sysadmin;
grant  execute on function app.owner_recover(uuid, uuid, uuid, uuid, text, text)       to sysadmin;
grant  execute on function app.owner_reset_request(uuid, uuid, uuid, uuid)             to sysadmin;

reset role;
