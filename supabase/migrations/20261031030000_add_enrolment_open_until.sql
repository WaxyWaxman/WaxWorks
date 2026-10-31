-- A-131 (finding 3 of the E-01 D order's review): an enrolment session exists
-- only while a link an Owner or a System Administrator issued is outstanding.
--
-- `users.enrolment_open_until` is set to now + 24 hours by every function that
-- sends a link — organization_create, owner_recover, user_add and
-- user_change_role for a Manager or Owner, user_invite_resend,
-- user_reset_request, owner_reset_request — in the same transaction as its log
-- entry. Those functions are the M-04, O-01 and S-01 orders'; none exists yet,
-- so until they land nothing in the product sets it. `auth_user_link`'s passkey
-- kind clears it (20261031030300). The access-token hook issues an enrolment
-- session only while it is in the future (20261031030400).
--
-- `system_administrators.enrolment_open_until` is set by hand by a project owner
-- before a System Administrator enrols, and recorded in the runbook (A-110, A-131).
--
-- Columns only: the tables' grants and policies are unchanged (A-118).
alter table public.users
  add column enrolment_open_until timestamptz;
comment on column public.users.enrolment_open_until is
  'A-131 — an issued link is outstanding until then; the hook issues an enrolment session only before it. Cleared by the first passkey enrolment.';

alter table public.system_administrators
  add column enrolment_open_until timestamptz;
comment on column public.system_administrators.enrolment_open_until is
  'A-131 — set by hand before a System Administrator enrols (runbook); the hook issues an enrolment session only before it.';
