#!/usr/bin/env bash
#
# Deploys the Makina landing page + studio to a single S3 bucket fronted by
# CloudFront. Layout in the bucket:
#
#   /                         → landing  (index.html, styles.css)
#   /app/                     → studio   (Angular bundle, base-href = /app/)
#
# Required: AWS CLI v2, an S3 bucket already configured for static hosting,
# and (optionally) a CloudFront distribution sitting in front of it.
#
# Usage:
#   MAKINA_BUCKET=my-bucket MAKINA_CF_ID=E123ABC ./deploy.sh
#
# Or edit the defaults in the config block below.

set -euo pipefail

# ---------- config ----------
BUCKET="${MAKINA_BUCKET:-}"               # required: S3 bucket name
DISTRIBUTION_ID="${MAKINA_CF_ID:-}"       # optional: CloudFront distribution ID
AWS_FLAGS=()
if [[ -n "${AWS_PROFILE:-}" ]]; then
  AWS_FLAGS+=(--profile "$AWS_PROFILE")
fi
if [[ -n "${AWS_REGION:-}" ]]; then
  AWS_FLAGS+=(--region "$AWS_REGION")
fi

BASE_HREF="${MAKINA_BASE_HREF:-/app/}"   # where the studio lives in the bucket
LANDING_PREFIX=""                         # where the landing lives (bucket root)

# ---------- paths ----------
HERE="$(cd "$(dirname "$0")" && pwd)"
STUDIO_DIR="$HERE"
LANDING_DIR="$HERE/../makina-landing"
STUDIO_OUT="$STUDIO_DIR/dist/automata-studio/browser"

# ---------- preflight ----------
if [[ -z "$BUCKET" ]]; then
  echo "ERROR: set MAKINA_BUCKET to your S3 bucket name." >&2
  exit 1
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found on PATH." >&2
  exit 1
fi
if [[ ! -d "$LANDING_DIR" ]]; then
  echo "ERROR: landing page not found at $LANDING_DIR." >&2
  exit 1
fi

S3_STUDIO="s3://${BUCKET}${BASE_HREF}"
S3_LANDING="s3://${BUCKET}/"

echo "▸ studio    → $S3_STUDIO"
echo "▸ landing   → $S3_LANDING"
echo "▸ base-href = $BASE_HREF"
echo

# ---------- build studio ----------
echo "==> Building studio (Angular, base-href $BASE_HREF)"
cd "$STUDIO_DIR"
npm run build -- --base-href "$BASE_HREF"

if [[ ! -d "$STUDIO_OUT" ]]; then
  echo "ERROR: expected build output at $STUDIO_OUT but it isn't there." >&2
  exit 1
fi

# ---------- build landing into a tmp dir, rewriting links ----------
echo "==> Preparing landing"
LANDING_TMP="$(mktemp -d -t makina-landing.XXXXXX)"
trap 'rm -rf "$LANDING_TMP"' EXIT
cp "$LANDING_DIR/index.html" "$LANDING_DIR/styles.css" "$LANDING_TMP/"
# Rewrite the local dev path "../automata-studio/" → "$BASE_HREF"
# Use a control char as the sed delimiter so '/' and '|' inside BASE_HREF don't break it.
SED_DELIM=$'\x01'
sed -i.bak "s${SED_DELIM}\\.\\./automata-studio/${SED_DELIM}${BASE_HREF}${SED_DELIM}g" "$LANDING_TMP/index.html"
rm -f "$LANDING_TMP/index.html.bak"

# ---------- upload studio ----------
echo "==> Syncing studio bundles (immutable, long-cache)"
aws s3 sync "$STUDIO_OUT/" "$S3_STUDIO" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable" \
  "${AWS_FLAGS[@]}"

echo "==> Uploading studio index.html (no-cache)"
aws s3 cp "$STUDIO_OUT/index.html" "${S3_STUDIO}index.html" \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/html; charset=utf-8" \
  "${AWS_FLAGS[@]}"

# ---------- upload landing ----------
echo "==> Uploading landing (no-cache)"
aws s3 cp "$LANDING_TMP/index.html" "${S3_LANDING}index.html" \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/html; charset=utf-8" \
  "${AWS_FLAGS[@]}"
aws s3 cp "$LANDING_TMP/styles.css" "${S3_LANDING}styles.css" \
  --cache-control "public, max-age=3600" \
  --content-type "text/css; charset=utf-8" \
  "${AWS_FLAGS[@]}"

# ---------- invalidate ----------
if [[ -n "$DISTRIBUTION_ID" ]]; then
  echo "==> Invalidating CloudFront"
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/" "/index.html" "/styles.css" "${BASE_HREF}" "${BASE_HREF}index.html" \
    "${AWS_FLAGS[@]}" >/dev/null
  echo "   (invalidation queued; takes ~30s to propagate)"
else
  echo "==> Skipping CloudFront invalidation (MAKINA_CF_ID not set)"
fi

echo
echo "✓ Done."
