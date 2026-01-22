#!/usr/bin/env bash
set -euo pipefail

# Setup Test Vault Data for LLM Matching Tests
# This script adds sample vault items via the desktop app API

API_URL="http://127.0.0.1:17373/v1/vault"

echo "Setting up test vault data..."
echo

# Current timestamp in ISO 8601 format
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Test data with proper structure (provenance + metadata)
ITEMS=(
  '{"key":"firstName","value":"John","label":"First Name","category":"identity","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"lastName","value":"Doe","label":"Last Name","category":"identity","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"email","value":"john.doe@example.com","label":"Email","category":"contact","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"phone","value":"+1-555-0123","label":"Phone","category":"contact","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"company","value":"Acme Corp","label":"Company","category":"identity","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"jobTitle","value":"Senior Engineer","label":"Job Title","category":"identity","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"street","value":"123 Main St","label":"Street Address","category":"address","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"city","value":"San Francisco","label":"City","category":"address","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"state","value":"CA","label":"State","category":"address","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
  '{"key":"zipCode","value":"94102","label":"ZIP Code","category":"address","provenance":{"source":"user_entered","timestamp":"'"$NOW"'","confidence":1.0},"metadata":{"created":"'"$NOW"'","updated":"'"$NOW"'","usage_count":0}}'
)

SUCCESS_COUNT=0
TOTAL=${#ITEMS[@]}

for item in "${ITEMS[@]}"; do
  KEY=$(echo "$item" | jq -r '.key')

  # Try to add the item
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$item")

  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo "✓ Added: $KEY"
    ((SUCCESS_COUNT++))
  else
    echo "✗ Failed to add $KEY (HTTP $HTTP_CODE)"
  fi
done

echo
echo "Added $SUCCESS_COUNT/$TOTAL vault items"
echo
echo "Verify in desktop app: http://localhost:1420/ → Vault tab"
