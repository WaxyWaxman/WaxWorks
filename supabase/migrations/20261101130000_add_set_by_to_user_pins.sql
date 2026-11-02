-- M-04 D M1, rework pass 2 — M-04 d55: who last set each PIN, by role.
--
-- "A PIN a person already holds carries into Owner standing only if an Owner or
-- the person themselves last set it. … Who last set each PIN is recorded by role
-- (an Owner, the holder, or a Manager); a PIN set before that record existed
-- counts as set by a Manager." (M-04 d55, A-89 as amended 2026-11-01.)
--
-- A table migration of its own: tables and functions never share one
-- (conventions §3.1, A-104). It runs as the migration role, like the table's
-- own (20261031012500); the grants there are unchanged — user_pins still has no
-- client grant at all (A-89, A-118), and waxworks_app's are table-wide.
--
-- The role, never the person: a person's id would tell nobody more than the
-- users.log entry that every PIN write appends already does (M-04 d28), and d55
-- asks only which of three kinds of setter it was.
--
-- `not null default 'manager'`: Postgres fills every row present when this runs
-- with the default, which is d55's "a PIN set before that record existed counts
-- as set by a Manager". Every function that writes user_pins names its setter
-- (20261101130200); the default stays as the conservative reading for any row
-- written without one — it never lets a PIN carry into Owner standing.
alter table public.user_pins
  add column set_by text not null default 'manager'
    constraint user_pins_set_by_check check (set_by in ('owner', 'holder', 'manager'));

comment on column public.user_pins.set_by is
  'M-04 d55: who last set this PIN, by role — owner, holder (the person themselves) or manager. A PIN a Manager set does not carry into Owner standing at a promotion. Rows present before 20261101130000 count as a Manager''s.';
