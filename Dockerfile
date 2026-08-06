# Debian slim rather than Alpine: better-sqlite3 and sharp both ship prebuilt
# glibc binaries, so the image builds without a compiler toolchain on every
# architecture this is likely to run on — an old Surface, a Pi, an x86 NAS.
ARG NODE_VERSION=22-bookworm-slim

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app
COPY package.json package-lock.json* ./

# Build tools are present only in this stage, in case a prebuild is unavailable
# for the target architecture and a native module has to compile from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

# gosu drops privileges cleanly after the entrypoint has fixed ownership on the
# data volume; su/sudo leave a shell in the process tree and mangle signals.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migrations are read from disk at boot rather than bundled, so they must be
# copied explicitly — Next's standalone tracing cannot see a runtime path.
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# Native modules stay external to the server bundle (see next.config.ts).
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
