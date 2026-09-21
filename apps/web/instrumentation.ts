export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

// `onRequestError = Sentry.captureRequestError` was here and is removed until M1
// lands A-93's scrubber (Findings 8, 20). It is a capture path with no
// `beforeSend`: the day a DSN is set it would emit unscrubbed server errors, and
// a definer function's refusal — "a designed outcome, not an error event"
// (A-92) — would reach Sentry carrying ContractError.details, the raw PostgREST
// error. Re-wire it with the scrubber, not before.
