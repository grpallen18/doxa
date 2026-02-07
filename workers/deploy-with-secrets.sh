#!/usr/bin/env bash
# Push Build secrets to the Worker, then deploy.
# Run by Cloudflare Build on each GitHub push. Secrets must be set in Build → Variables and secrets.

set -e

echo "Pushing secrets to Worker..."
if [ -n "${SCRAPE_SECRET}" ]; then
  echo -n "${SCRAPE_SECRET}" | npx wrangler secret put SCRAPE_SECRET
fi
if [ -n "${SUPABASE_RECEIVE_URL}" ]; then
  echo -n "${SUPABASE_RECEIVE_URL}" | npx wrangler secret put SUPABASE_RECEIVE_URL
fi
if [ -n "${CLOUDFLARE_ACCOUNT_ID}" ]; then
  echo -n "${CLOUDFLARE_ACCOUNT_ID}" | npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
fi
if [ -n "${CLOUDFLARE_API_TOKEN}" ]; then
  echo -n "${CLOUDFLARE_API_TOKEN}" | npx wrangler secret put CLOUDFLARE_API_TOKEN
fi

echo "Deploying Worker..."
npx wrangler deploy
