import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['[::1]', '127.0.0.1', 'localhost:3000'],
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "market-pulse",
  project: "market-pulse",
});
