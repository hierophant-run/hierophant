#!/usr/bin/env bash
# Builds in a clean copy, because the Cloudflare adapter compiles any .env.local into the Worker.
# Usage: scripts/deploy-cloudflare.sh [--secrets]
set -euo pipefail

SITE_URL="${SITE_URL:-https://hierophanthq.com}"
DOCS_URL="${DOCS_URL:-https://docs.hierophanthq.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT/apps/web/.env.local"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

rsync -a \
  --exclude node_modules --exclude .next --exclude .open-next --exclude .wrangler \
  --exclude '.env*' --exclude .dev.vars --exclude .research --exclude '*.mov' --exclude .DS_Store \
  "$ROOT/" "$BUILD/"

cd "$BUILD"
pnpm install --frozen-lockfile --prefer-offline
pnpm --filter @hierophant/engine --filter @hierophant/intel build

cd "$BUILD/apps/web"
NEXT_PUBLIC_SITE_URL="$SITE_URL" NEXT_PUBLIC_DOCS_URL="$DOCS_URL" pnpm exec opennextjs-cloudflare build
node "$ROOT/apps/web/scripts/check-bundle-secrets.mjs" "$ENV_FILE" .open-next

CLOUDFLARE_API_TOKEN="$(security find-generic-password -s cloudflare-api-token -w)"
export CLOUDFLARE_API_TOKEN

if [ "${1:-}" = "--secrets" ]; then
  node -e '
    const lines = require("node:fs").readFileSync(process.argv[1], "utf8").split("\n");
    const out = {};
    for (const key of ["GITHUB_TOKEN", "DATABASE_URL"]) {
      const line = lines.find((entry) => entry.startsWith(`${key}=`));
      if (!line) throw new Error(`${key} is missing`);
      out[key] = line.slice(key.length + 1).trim();
    }
    process.stdout.write(JSON.stringify(out));
  ' "$ENV_FILE" | pnpm exec wrangler secret bulk
fi

pnpm exec opennextjs-cloudflare deploy
