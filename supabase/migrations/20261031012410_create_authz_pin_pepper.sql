set role pepper_reader;   -- A-127: the accessor is owned by pepper_reader, the one role that reads Vault

-- authz.pin_pepper() — A-127, A-115, A-89.
-- Returns the Vault secret `pin_pepper`, and raises pin_pepper_missing (XX000)
-- when it is absent: A-115's fail-closed rule in one place. Every PIN function
-- calls this; none reads vault itself.
create or replace function authz.pin_pepper()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
  select s.decrypted_secret into v_pepper
    from vault.decrypted_secrets s
   where s.name = 'pin_pepper';
  if v_pepper is null or v_pepper = '' then
    raise exception 'pin_pepper_missing' using errcode = 'XX000';
  end if;
  return v_pepper;
end
$$;

revoke execute on function authz.pin_pepper() from public;   -- A-103, A-107
grant  execute on function authz.pin_pepper() to waxworks_app;

reset role;

-- pepper_reader needed `usage` and `create` on authz only to own this function
-- and grant it; it keeps nothing beyond the Vault read (A-127).
revoke usage, create on schema authz from pepper_reader;
