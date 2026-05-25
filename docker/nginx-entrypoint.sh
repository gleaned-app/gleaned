#!/bin/sh
# Generates /config.json at container startup so the app can pre-fill the
# sync URL and username without the user re-entering docker-compose values.
# Only syncUsername (never the CouchDB password) is written.
set -e

USERNAME="${COUCHDB_USER:-admin}"

if [ -n "${GLEANED_SYNC_URL}" ]; then
  printf '{"syncUsername":"%s","syncUrl":"%s"}\n' "$USERNAME" "$GLEANED_SYNC_URL" \
    > /usr/share/nginx/html/config.json
else
  printf '{"syncUsername":"%s"}\n' "$USERNAME" \
    > /usr/share/nginx/html/config.json
fi
