import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image does not need
  // node_modules. Keeps the production image small and the Dockerfile simple.
  output: "standalone",

  // better-sqlite3 and sharp are native modules; they must stay external to the
  // server bundle so their .node bindings resolve at runtime.
  serverExternalPackages: ["better-sqlite3", "sharp"],

  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
