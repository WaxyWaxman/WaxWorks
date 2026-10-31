set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- The six row-security helpers (§5, A-87, A-122), in `authz` (A-124).
--
-- The four claim readers read the claims the access-token hook mints (§5.4)
-- from PostgREST's `request.jwt.claims` — the setting Supabase's own
-- `auth.jwt()` reads, read directly so `waxworks_app` needs nothing in `auth`.
--
-- The two reachability helpers are `stable security definer` over `users` and
-- `store_assignments` (§5), so the check is live and a stale claim reads
-- nothing. They are plpgsql because the tables they read are created by the
-- next migration, and a policy on those tables needs the helpers to exist first.

create or replace function authz.org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id', '')::uuid
$$;

create or replace function authz.store_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'store_id', '')::uuid
$$;

create or replace function authz.user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_id', '')::uuid
$$;

create or replace function authz.principal()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'principal', '')
$$;

-- §5 as amended by A-122: true for a store session; for a personal session the
-- person is active and a Manager or Owner; false for every other principal.
create or replace function authz.org_reachable()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  case authz.principal()
    when 'store' then
      return true;
    when 'person' then
      return exists (
        select 1 from public.users u
         where u.id = authz.user_id()
           and u.org_id = authz.org_id()
           and u.active
           and u.role in ('manager', 'owner'));
    else
      return false;
  end case;
end
$$;

-- §5 as amended by A-122: true for a store session; for a personal session the
-- person is active, a Manager or Owner, and assigned to authz.store_id() — or
-- an active Owner of authz.org_id().
create or replace function authz.store_reachable()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  case authz.principal()
    when 'store' then
      return true;
    when 'person' then
      return exists (
        select 1 from public.users u
         where u.id = authz.user_id()
           and u.org_id = authz.org_id()
           and u.active
           and (   u.role = 'owner'
                or (u.role = 'manager'
                    and exists (select 1 from public.store_assignments a
                                 where a.org_id = u.org_id
                                   and a.user_id = u.id
                                   and a.store_id = authz.store_id()))));
    else
      return false;
  end case;
end
$$;

-- A-124: execute for authenticated and sysadmin only; never public or anon (A-107).
revoke execute on function authz.org_id()          from public;
revoke execute on function authz.store_id()        from public;
revoke execute on function authz.user_id()         from public;
revoke execute on function authz.principal()       from public;
revoke execute on function authz.org_reachable()   from public;
revoke execute on function authz.store_reachable() from public;
grant  execute on function authz.org_id()          to authenticated, sysadmin;
grant  execute on function authz.store_id()        to authenticated, sysadmin;
grant  execute on function authz.user_id()         to authenticated, sysadmin;
grant  execute on function authz.principal()       to authenticated, sysadmin;
grant  execute on function authz.org_reachable()   to authenticated, sysadmin;
grant  execute on function authz.store_reachable() to authenticated, sysadmin;

reset role;
