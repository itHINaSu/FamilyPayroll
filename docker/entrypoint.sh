#!/bin/sh
set -e

# Run the application as the host user that owns the bind-mounted data
# directory. Without this the database file ends up owned by uid 1000 inside the
# container, which on a NAS or a self-hosted box is somebody else entirely — and
# the operator cannot read their own backups.

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  # The image ships a `node` user at 1000:1000; remap it if the host differs.
  if [ "$(id -g node)" != "$PGID" ]; then
    groupmod -o -g "$PGID" node
  fi
  if [ "$(id -u node)" != "$PUID" ]; then
    usermod -o -u "$PUID" node
  fi

  mkdir -p "$DATA_DIR"

  # Only chown when it is actually wrong. On a large data directory this saves a
  # slow recursive walk on every single restart.
  if [ "$(stat -c '%u:%g' "$DATA_DIR")" != "$PUID:$PGID" ]; then
    echo "[entrypoint] setting ownership of $DATA_DIR to $PUID:$PGID"
    chown -R "$PUID:$PGID" "$DATA_DIR"
  fi

  echo "[entrypoint] starting as ${PUID}:${PGID} (TZ=${TZ:-UTC})"
  exec gosu "$PUID:$PGID" "$@"
fi

# Already unprivileged (user: was set in compose); just run.
exec "$@"
