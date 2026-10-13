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
| Invite and reset templates given a real body (Authentication → Emails → Templates) | A-116 | before the first real Owner is invited | The default one-line template reads as phishing |
| Auth links point at the product's own origin (`{{ .SiteURL }}/auth/confirm?token_hash=…`), not `supabase.co` | A-116 | with M1's accept-invite route (E-01 order) | Sender and link domains then match |
| Access-token lifetime confirmed at 3600 s | A-116 | any time | Supabase's default |
| Access-token hook enabled | A-87, A-116 | after the M1 migration that creates the hook | Without it every write is refused (A-40) |
| `pin_pepper` created: `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pin_pepper');` | A-115 | after M1's migrations, before the first PIN | Record who and when — never the value |
| Three System Administrators: an Auth user each, then a `system_administrators` row each — sr-talbot, gimpymatey, WaxyWaxman | A-110 | after the M1 migration that creates the table | Each distinct from any Owner account they hold |
| Passkey sign-in for System Administrators | S-01 d6 | before the first real Organization | Supabase passkeys were beta on 2026-10-13 |
| The first shop's settings values answered and in `store_create`'s body | A-112 | before the M1 **D** order fixes the body | Open question, sr-talbot (`architecture.md` §11) |
| M1's migrations applied (`supabase db push`, no seed) | A-101, A-109 | when M1 merges | — |

## 3. Before M6

| Step | Decision | Notes |
|---|---|---|
| Upgrade to a paid Supabase plan; verify a backup restores | A-109 (amended 2026-10-13) | Until then real data has **no backup** |
| Re-verify every row of §1 and §2 against the dashboards | §11, conventions §2.1 | Settings drift silently |
