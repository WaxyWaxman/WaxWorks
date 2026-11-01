-- M-04 D M1, review corrections — A-139: internal helpers live in a schema the
-- API does not expose; `app` holds §6's entry points only.
--
-- A-139 leaves the name to this migration: `app_internal`. It is to `app` what
-- `authz` is to the row-security helpers (A-124), with one difference — no
-- session role reaches it at all. Its functions are called only from inside the
-- definer functions in `app`, which run as their owner, waxworks_app (A-104), and
-- the owner of a schema needs no grant on it. So:
--   * owned by waxworks_app, so A-104's `set role` opener creates in it;
--   * `usage` revoked from public and granted to nobody — not authenticated,
--     not anon, not service_role, not sysadmin;
--   * absent from config.toml's [api].schemas, so PostgREST has no URL for it.
-- A wrongly granted helper here still has no route (A-139's *why*).
--
-- A schema, not a table or a function: it stands alone, as `authz` did (A-105).
create schema app_internal authorization waxworks_app;
revoke all on schema app_internal from public;
comment on schema app_internal is
  'Wax Works — internal helpers the app entry points call (A-139). Owned by waxworks_app; not exposed to the API; no usage granted to any session role; functions only.';
