#!/bin/sh
# Generates required secrets and writes them into .env.
# Run once before starting gleaned: sh setup.sh
set -e

ENV_FILE="$(dirname "$0")/.env"

if [ ! -f "$ENV_FILE" ]; then
  cp "$(dirname "$0")/.env.example" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

# Generate SEND_SECRET if not set
if ! grep -q "^SEND_SECRET=.\+" "$ENV_FILE" 2>/dev/null; then
  SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null \
    || openssl rand -hex 32)
  sed -i "s|^SEND_SECRET=.*|SEND_SECRET=$SECRET|" "$ENV_FILE"
  echo "Generated SEND_SECRET"
fi

# Generate VAPID keys if not set
if ! grep -q "^VAPID_PUBLIC_KEY=.\+" "$ENV_FILE" 2>/dev/null; then
  echo "Generating VAPID keys (requires Docker)..."
  VAPID=$(docker run --rm ghcr.io/gleaned-app/gleaned-pusher:latest \
    node -e "const v=require('web-push').generateVAPIDKeys();process.stdout.write(v.publicKey+'\n'+v.privateKey)")
  PUB=$(echo "$VAPID" | head -1)
  PRIV=$(echo "$VAPID" | tail -1)
  sed -i "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=$PUB|" "$ENV_FILE"
  sed -i "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=$PRIV|" "$ENV_FILE"
  echo "Generated VAPID keys"
fi

echo ""
echo "Done. Edit docker/.env to set DOMAIN and COUCHDB_PASSWORD, then run:"
echo "  docker compose -f docker/compose.traefik.yml up -d   # with Traefik"
echo "  docker compose -f docker/compose.yml up -d           # port-based"
