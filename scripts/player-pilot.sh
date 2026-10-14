#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/player-pilot.sh https://YOUR-PUBLISHED-SERVER"
  exit 1
fi
SERVER="${1%/}"
if [[ "$SERVER" != https://* ]]; then echo "Use the server's HTTPS URL."; exit 1; fi
: "${REPLIT_DEV_DOMAIN:?Run this inside the client Replit}"
BASE_PATH=/player/ PORT=22772 pnpm --filter @workspace/player-web run build
PRIVATE_DIR="$(mktemp -d /tmp/code-gods-client.XXXXXX)"
chmod 700 "$PRIVATE_DIR"
echo "Client starting on the existing /player/ preview route."
echo "Private one-time launch link will be in: $PRIVATE_DIR/launch"
echo "Open that file privately within 60 seconds; do not share or commit its contents."
exec env -i PATH="$PATH" HOME="$HOME" PORT=22772 \
  PLAYER_ORIGIN="https://$REPLIT_DEV_DOMAIN" \
  node --experimental-transform-types lib/player-client/src/serve.ts \
  "$SERVER/api/player/v1" artifacts/player-web/dist/public "$PRIVATE_DIR/launch"
