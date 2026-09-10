# Architecture

Nothing here yet — architecture is derived from the flows, and only E-02 is
`Specified`. See [`docs/README.md`](../README.md) for flow status.

Documents land here as the flows constrain them:

| Document | Blocked on |
|---|---|
| `overview.md` — components and boundaries | Offline behaviour at the till (PRD §5), platform and hardware (PRD §5) |
| `data-model.md` — entities, keys, scoping | The multi-store scoping questions in PRD §6; whether a customer entity exists |
| `integrations.md` — Discogs, payments, printers | E-05 payment decisions; M-02 prefetch mechanics |
| `security.md` — authorisation, tenant isolation, audit | E-01 authentication; M-04 manager override mechanics |

Cross-cutting decisions live in [`../decisions/`](../decisions/) as ADRs. Run
`/architecture` to work on any of this.
