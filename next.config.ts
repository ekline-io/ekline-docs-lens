import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin Turbopack's workspace root to this directory so it can never climb out
// when a stray lockfile appears in a parent dir. Without this, Turbopack +
// Tailwind v4 can scan the whole home directory on first request, which has
// been observed to exhaust 24 GB of RAM and freeze the host.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // playwright and @sparticuz/chromium-min ship native modules and dynamic
  // /tmp paths that Turbopack can't statically bundle. Mark them external so
  // they're required at runtime from node_modules in the serverless function.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium-min"],
};

export default nextConfig;
