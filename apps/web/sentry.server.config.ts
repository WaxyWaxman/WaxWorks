// Sentry, server runtime. Error events are an operational signal, never the
// audit record (A-92); what an event may carry is A-93/A-94, binding from M1.
// The DSN is a server-runtime environment variable, per environment (A-100).
// At M0 nothing calls Sentry: no function exists to raise a system flag.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? "local",
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
