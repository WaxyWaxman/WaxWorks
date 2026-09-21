import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {};

// Sentry's build step is wired but uploads nothing: no org, project or auth
// token is configured (A-92 decides what Sentry is, not how it is provisioned).
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  telemetry: false,
});
