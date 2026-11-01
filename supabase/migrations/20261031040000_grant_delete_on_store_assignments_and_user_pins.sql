-- M-04 D M1 — the two deletes user administration needs, and no others.
--
-- A-104: waxworks_app holds `delete` "only where A-54 and A-70 permit one" — a
-- record deleted only where nothing cites it and no money moved. The E-01 D
-- order granted delete nowhere, because nothing it built deleted. Two of M-04's
-- acts remove a row that nothing cites:
--
--   store_assignments — user_unassign removes a Store from a person's
--     assignments (M-04 d27). The relation has no row to deactivate: it is the
--     assignment, and the change is logged on users.log (A-55, §5.1).
--   user_pins — a demotion to Employee clears the PIN (M-04 d39) and user_set_pin
--     clears it for someone who holds no Store (M-04 d28, d35). The hash is cited
--     by nothing; *PIN cleared* is logged, never a value (A-93).
--
-- No client grant changes (A-4, A-118): this is the owner's ceiling only. Users
-- are still never deleted (M-04 d5): waxworks_app holds no delete on users.
-- A grant, not a table: it lives apart from the function migrations (A-104).
grant delete on public.store_assignments to waxworks_app;
grant delete on public.user_pins to waxworks_app;
