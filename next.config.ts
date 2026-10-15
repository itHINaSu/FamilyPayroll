import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image does not need
  // node_modules. Keeps the production image small and the Dockerfile simple.
  output: "standalone",

  // better-sqlite3 and sharp are native modules; they must stay external to the
  // server bundle so their .node bindings resolve at runtime.
  serverExternalPackages: ["better-sqlite3", "sharp"],

  eslint: { ignoreDuringBuilds: true },

  // Setup moved into Settings. Old addresses — bookmarks, links in earlier
  // notifications — still land in the right place.
  async redirects() {
    return [
      { source: "/config", destination: "/settings", permanent: true },
      { source: "/children", destination: "/settings/family", permanent: true },
      { source: "/children/:childId", destination: "/settings/family/:childId", permanent: true },
      { source: "/responsibilities", destination: "/settings/expectations", permanent: true },
      { source: "/responsibilities/:id", destination: "/settings/expectations/:id", permanent: true },
      { source: "/jobs", destination: "/settings/jobs", permanent: true },
      { source: "/bills", destination: "/settings/bills", permanent: true },
    ];
  },
};

export default nextConfig;
