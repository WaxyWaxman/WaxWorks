// Sentry, edge runtime. See sentry.server.config.ts for the rules (A-92, A-100).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? "local",
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
