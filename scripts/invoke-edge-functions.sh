#!/usr/bin/env bash
# Invoke Supabase Edge Functions for health summaries (weekly-summary / monthly-summary).
# Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from apps/server/.env.local .
# Usage: ./scripts/invoke-edge-functions.sh [weekly|monthly]

set -e
ENV_FILE="apps/server/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  exit 1
fi

# Read uncommented lines only; value is everything after first =
SUPABASE_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | grep -v '^#' | head -1 | cut -d= -f2- | tr -d '\r')
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in $ENV_FILE"
  exit 1
fi

FUNC="${1:-weekly}"
case "$FUNC" in
  weekly)
    PATH_SUFFIX="weekly-summary"
    ;;
  monthly)
    PATH_SUFFIX="monthly-summary"
    ;;
  backfill)
    PATH_SUFFIX="backfill-summaries"
    ;;
  *)
    echo "Usage: $0 [weekly|monthly|backfill]"
    exit 1
    ;;
esac

URL="${SUPABASE_URL%/}/functions/v1/${PATH_SUFFIX}"
echo "Calling $URL ..."
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
echo ""
