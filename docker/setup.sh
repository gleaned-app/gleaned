#!/bin/sh
# Generates required secrets and writes them into docker/.env.
# Run once before starting gleaned: sh docker/setup.sh
set -e

ENV_FILE="$(dirname "$0")/.env"

# ── Create .env from template ─────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cp "$(dirname "$0")/.env.example" "$ENV_FILE"
  echo "Created docker/.env from .env.example"
fi

# ── Portable in-place sed (GNU + BSD/macOS) ───────────────────────────────────
sedi() {
  sed -i'' "$@"
}

# ── Generate SEND_SECRET ──────────────────────────────────────────────────────
if ! grep -qE "^SEND_SECRET=.+" "$ENV_FILE" 2>/dev/null; then
  SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null \
    || openssl rand -hex 32)
  sedi "s|^SEND_SECRET=.*|SEND_SECRET=$SECRET|" "$ENV_FILE"
  echo "Generated SEND_SECRET"
fi

# ── Generate VAPID keys ───────────────────────────────────────────────────────
if ! grep -qE "^VAPID_PUBLIC_KEY=.+" "$ENV_FILE" 2>/dev/null; then
  echo "Generating VAPID keys..."

  VAPID=""

  # 1. Try project node_modules (works after pnpm install)
  PROJECT_ROOT="$(dirname "$0")/.."
  if [ -f "$PROJECT_ROOT/node_modules/.bin/node" ] || command -v node >/dev/null 2>&1; then
    VAPID=$(node -e "
      try {
        const v = require('$(cd "$PROJECT_ROOT" && pwd)/node_modules/web-push').generateVAPIDKeys();
        process.stdout.write(v.publicKey + '\n' + v.privateKey);
      } catch(e) { process.exit(1); }
    " 2>/dev/null || true)
  fi

  # 2. Fall back to the gleaned Docker image (no local Node needed).
  #    Read the configured image reference from the env file so digest-pinned
  #    deployments use the same image they run in production.
  #    --pull=never prevents any network contact during setup: if the image is
  #    not already cached locally, docker run fails immediately and we fall
  #    through to the manual instructions below. This closes the supply-chain
  #    window where a compromised registry could return attacker-known keys.
  if [ -z "$VAPID" ] && command -v docker >/dev/null 2>&1; then
    _img=$(grep -m1 "^GLEANED_IMAGE=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
    _img="${_img:-ghcr.io/gleaned-app/gleaned:latest}"
    VAPID=$(docker run --rm --pull=never "$_img" \
      node -e "const v=require('/app/node_modules/web-push').generateVAPIDKeys();process.stdout.write(v.publicKey+'\n'+v.privateKey)" \
      2>/dev/null || true)
  fi

  if [ -n "$VAPID" ]; then
    PUB=$(printf '%s' "$VAPID"  | head -1)
    PRIV=$(printf '%s' "$VAPID" | tail -1)
    sedi "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=$PUB|"   "$ENV_FILE"
    sedi "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=$PRIV|" "$ENV_FILE"
    echo "Generated VAPID keys"
  else
    echo "  Could not generate VAPID keys automatically."
    echo "  Run manually after pnpm install:"
    echo "    node -e \"console.log(require('./node_modules/web-push').generateVAPIDKeys())\""
    echo "  Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to docker/.env"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Done. Review docker/.env, then run:"
echo "  docker compose -f docker/compose.traefik.yml up -d   # with Traefik + TLS"
echo "  docker compose -f docker/compose.yml up -d           # port-based (HTTP)"
