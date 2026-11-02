set role waxworks_app;   -- A-104: the whole migration runs as the owner; functions only in this file

-- M-04 D M1, rework pass 3 — app_internal.authoriser_recheck, replaced (A-101:
-- 20261101130100 is merged and never edited) to RETURN the role it read.
--
--   Row 55, M-04 d59 (finding 37): "The setter's role that decision 55 records is
--   the authoriser's role as A-140's re-check reads it after the function's last
--   lock — not as it was read before the wait." The four functions that write a
--   PIN (20261101140100) record this return through app_internal.pin_setter.
--
-- Its checks are unchanged. A return type cannot change under `create or
-- replace`, so the function is dropped and created again; the ten callers are
-- plpgsql and resolve it by name at call time, and the six that do not write a
-- PIN still `perform` it and discard the role.

drop function app_internal.authoriser_recheck(uuid, uuid, text, uuid[], boolean);

-- ── app_internal.authoriser_recheck — A-140 (row 53); M-04 d59 (row 55) ─────
-- After the last A-138 step a function takes, the person who authorised the act
-- is read again: still active, still of the role the act requires (p_role:
-- 'owner' for an Owner-only act, 'manager' for one a Manager may do), and, for a
-- Manager, still holding the reach the act depends on — sharing one of p_reach's
-- Stores (M-04 d37, d41), or holding every one of them when p_every (a Manager's
-- own Stores, M-04 d30). Refused role_refused before anything is written: the
-- detail is the role the act requires, or `owner` where only reach was lost, as
-- each function's own reach check refuses (conventions §5; A-140's note 3).
--
-- Returns the role it read — 'owner' or 'manager' — which is the role a PIN
-- written by the act is recorded as set by (M-04 d59).
--
-- Takes no lock (A-140: "a final step … that takes no lock"). Under READ
-- COMMITTED this statement's snapshot is taken after the caller's last lock was
-- granted, so a demotion that committed while the caller waited is seen here
-- (A-140's note 1).
create function app_internal.authoriser_recheck(
  p_org_id uuid,
  p_by_id  uuid,
  p_role   text,
  p_reach  uuid[]  default null,
  p_every  boolean default false
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_role   text;
  v_active boolean;
  v_held   uuid[];
begin
  select u.role, u.active into v_role, v_active
    from public.users u where u.id = p_by_id and u.org_id = p_org_id;
  if not coalesce(v_active, false)
     or (v_role is distinct from 'owner' and (p_role = 'owner' or v_role is distinct from 'manager')) then
    raise exception 'role_refused' using errcode = '42501', detail = p_role;
  end if;
  if v_role = 'manager' and p_reach is not null then
    v_held := app_internal.store_set(p_org_id, p_by_id);
    if (p_every and not (p_reach <@ v_held)) or (not p_every and not (p_reach && v_held)) then
      raise exception 'role_refused' using errcode = '42501', detail = 'owner';
    end if;
  end if;
  return v_role;
end
$$;

revoke execute on function app_internal.authoriser_recheck(uuid, uuid, text, uuid[], boolean) from public;   -- A-103, A-107
-- No grant: internal to the definer functions, which run as waxworks_app (A-139).

reset role;
