#!/usr/bin/env bash
# Writes .env.production from AWS Secrets Manager using the EC2 instance role.
# No long-lived AWS keys exist on the instance (spec sec. 18, 24).
#
# The secret is a JSON object, e.g. {"DEMO_PASSWORD": "...", "BEDROCK_MODEL_ID": "..."}.
set -euo pipefail

SECRET_ID="${ACTIVITYOPS_SECRET_ID:-activityops/production}"
REGION="${AWS_REGION:?set AWS_REGION to the region holding the secret}"
OUT="${1:-.env.production}"

umask 077 # the file is readable by the owner only
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query SecretString \
  --output text |
  jq -r 'to_entries[] | "\(.key)=\(.value)"' >"$OUT.tmp"
mv "$OUT.tmp" "$OUT"
echo "wrote $OUT ($(wc -l <"$OUT") keys); values not printed"
