# Wax Works — production runbook

**Maintained by:** whoever performs a step, in the same change as the step.
**Decided by:** [architecture](../architecture.md) A-116; the steps themselves are A-109, A-110, A-115, A-116 and S-01 d6.

Every act done **by hand** against production — a dashboard setting, a row
written in the SQL editor, an environment variable — is recorded here: what,
who, when, and the decision behind it. **Never a secret's value.** A setting
that is not in this file is a setting nobody can show was made.

Production is one Supabase project, `udrtvdlmoaqsgzxobwwq` (`ca-central-1`,
Postgres 17, free plan), and one Vercel project, `pressers/wax-works`, serving
`https://wax-works.vercel.app` (A-109).

---

## 1. Done

| Step | Decision | Done by | Date | Evidence |
|---|---|---|---|---|
| Passkeys turned on for the project (Authentication) | E-01 d33, S-01 d7 | sr-talbot | 2026-10-13 | reported by sr-talbot in session; not checked from the repository |
| Invite and reset templates given a real body in the dashboard — subjects *WaxWorks - Let's get you set-up* and *WaxWorks - Let's get you back in*. **The dashboard copies must match `supabase/templates/invite.html` and `recovery.html`** (loaded by `config.toml` for local and CI); change both in the same pull request | A-116 | sr-talbot | 2026-10-13 | text pasted from the dashboard into the repository files |
| Site URL `https://wax-works.vercel.app`; redirect URLs `https://wax-works.vercel.app/**` only, `localhost` removed | A-116 | sr-talbot | 2026-10-13 | second test invite's `redirect_to` = `https://wax-works.vercel.app`; both test users deleted |
| `mail.waxworks.store` verified in Resend — DKIM TXT `resend._domainkey.mail`, MX and SPF under `send.mail`; DMARC `p=none` at `_dmarc.waxworks.store` | A-116 | sr-talbot | 2026-10-13 | Resend: verified; public DNS checked |
| Custom SMTP on: Supabase's Resend integration, sender `mail.waxworks.store` | A-116 | sr-talbot | 2026-10-13 | test invite to sr-talbot's own address **arrived — in the spam folder** (new domain; default one-line template; link to `supabase.co`) |
| Domain `waxworks.store` bought in the Pressers Vercel team; DNS on Vercel. **Auto-renew was off at purchase** — expires 2027-10-13; renewal quoted at $44 | A-116 | sr-talbot | 2026-10-13 | Vercel domains list |
| Production project created; the integration's Sep 20 project and its 17 variables removed | A-109 | sr-talbot | 2026-10-13 | M0 order, row 13 Evidence |
| M0's two migrations applied (`supabase db push`, no seed) | A-101, A-109 | sr-talbot | 2026-10-13 | `supabase migration list`: both Local and Remote |
| Public sign-up off | A-91 | sr-talbot | 2026-10-13 | dashboard; not readable from the repository |
| `app` in the exposed schemas | A-105 | sr-talbot | 2026-10-13 | dashboard |
| Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Sensitive), Production only; Shared tab empty | A-109 | sr-talbot | 2026-10-13 | variables page screenshot, in session |
| Vercel: Framework Preset Next.js, Root Directory `apps/web`, Node 24.x | M0 finding 40 | sr-talbot | 2026-10-13 | `https://wax-works.vercel.app/` → `200` |

## 2. Before the first real shop data

In order where order matters. Tick by moving the row to §1.

| Step | Decision | When | Notes |
|---|---|---|---|
| Auto-renew turned on for `waxworks.store` | A-116 | before 2027-10-13 | A lapsed domain stops every invite and reset |
| **Invite and recovery templates reworded** — *create your passkey*, not *choose your own password*; dashboard and `supabase/templates/` together | E-01 d33 | before the first real Owner is invited | The current text promises a password that no longer exists |
| Auth links point at the product's own origin (`{{ .SiteURL }}/auth/confirm?token_hash=…`), not `supabase.co` | A-116 | with M1's accept-invite route (E-01 order) | Sender and link domains then match |
| Access-token lifetime confirmed at 3600 s | A-116 | any time | Supabase's default |
| **Email provider on, sign-up off** — Authentication → Sign In / Providers: *Enable Email provider* **on** (a store account signs in by email and password, E-01 d24), *Allow new users to sign up* **off** (A-91). Two separate switches in the dashboard | A-91 (amended 2026-10-31) | before the first store account signs in | Locally the CLI ties email login to `[auth.email] enable_signup`; production does not |
| Access-token hook enabled | A-87, A-116 | after the M1 migration that creates the hook | Without it every write is refused (A-40) |
| `pin_pepper` created: `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pin_pepper');` | A-115 | after M1's migrations, before the first PIN | Record who and when — never the value |
| **Production's email link lifetime at most 24 hours** (Authentication → Email: OTP / link expiry), so an issued link never outlives the enrolment window | A-131 | before the first real Owner is invited | Local `otp_expiry` is 3600 s |
| **Three System Administrators** — sr-talbot, gimpymatey, WaxyWaxman — each distinct from any Owner account they hold. **For each, in this order, one entry per person:** (1) create the Auth user; (2) check its id is linked to no `users`, `stores` or `system_administrators` row (A-132); (3) write its `system_administrators` row, active, with `enrolment_open_until = now() + interval '24 hours'` (A-131) — the column lives on the row, so the row comes first; (4) the person enrols their passkey within the window; (5) **at once**, clear the window: `update system_administrators set enrolment_open_until = null where auth_user_id = '…'` (A-134); (6) list the Auth user's passkeys (`GET /auth/v1/admin/users/{id}/passkeys`, secret key) and confirm **exactly one** exists — a second means the mailbox was used while the window was open: remove it and investigate. Record who did steps 3, 5 and 6 and when | A-110, A-131, A-132, A-134, S-01 d7 | after M1's migrations are pushed | Enrolling does not close the window; until step 5, that mailbox can mint a second `sysadmin` passkey. Clearing it does not remove one already minted — step 6 is the check |
| **Production's PostgREST `db-tx-end` is `commit`** — no client override. PostgREST reads it from three places, and all three are checked: (1) the project's API settings in the dashboard, if exposed; (2) in-database configuration (on by default, `db-config`): `select r.rolname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator';` — no `pgrst.db_tx_end` entry, or `commit`; (3) a pre-config function: `db-pre-config` names one if set — check `authenticator`'s settings above for `pgrst.db_pre_config`, and if present read that function for `db_tx_end`. Record what each returned. Where a source is not readable, record that it was looked for and not found — never that it was read | A-133 | before `supabase db push`, and after any PostgREST upgrade | With an override allowed, `Prefer: tx=rollback` discards a wrong PIN's refusal row and a correct PIN names its holder untraced (shown 2026-10-31, E-01 D order finding 49). `db-tx-end` is not reloadable: a change takes effect at PostgREST's next restart, so a value found in (2) or (3) may not be live yet — and will be |
| `store_create`'s body carries the first shop's values — Alberta, CAD, fiscal year end March 31, 80mm, M-06's defaults otherwise | A-112 | in the M1 **D** order (M1 tables), and M2's for the tax tables | Values answered 2026-10-13 (`architecture.md` §11) |
| M1's migrations applied (`supabase db push`, no seed) | A-101, A-109 | when M1 merges | — |

## 3. Before M6

| Step | Decision | Notes |
|---|---|---|
| Upgrade to a paid Supabase plan; verify a backup restores | A-109 (amended 2026-10-13) | Until then real data has **no backup** |
| Re-verify every row of §1 and §2 against the dashboards | §11, conventions §2.1 | Settings drift silently |
