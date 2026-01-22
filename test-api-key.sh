#!/usr/bin/env bash
set -euo pipefail

# Test Claude API Key
# Usage: ./test-api-key.sh [API_KEY]
# If no API key is provided, will prompt for it

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get API key
if [ -z "${1:-}" ]; then
  echo -e "${YELLOW}Enter your Claude API key (or press Ctrl+C to exit):${NC}"
  read -s API_KEY
  echo
else
  API_KEY="$1"
fi

# Validate key format
if [[ ! "$API_KEY" =~ ^sk-ant- ]]; then
  echo -e "${RED}✗ Error: API key should start with 'sk-ant-'${NC}"
  exit 1
fi

echo -e "${BLUE}Testing Claude API key...${NC}"
echo

# Test with minimal API call
HTTP_CODE=$(curl -s -o /tmp/claude-test-response.json -w "%{http_code}" \
  -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }')

echo "HTTP Status: $HTTP_CODE"
echo

if [ "$HTTP_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ Success! API key is valid.${NC}"
  echo

  # Show model info
  MODEL=$(jq -r '.model' /tmp/claude-test-response.json 2>/dev/null || echo "unknown")
  USAGE=$(jq -r '.usage.input_tokens' /tmp/claude-test-response.json 2>/dev/null || echo "0")

  echo "Model: $MODEL"
  echo "Test consumed: $USAGE input tokens"
  echo

  # Show first few characters of response
  RESPONSE=$(jq -r '.content[0].text' /tmp/claude-test-response.json 2>/dev/null || echo "")
  if [ -n "$RESPONSE" ]; then
    echo "Response preview: \"$RESPONSE\""
  fi

  echo
  echo -e "${GREEN}You can now use this API key in Asterisk Settings.${NC}"

elif [ "$HTTP_CODE" -eq 401 ]; then
  echo -e "${RED}✗ Authentication failed: Invalid API key${NC}"
  echo
  cat /tmp/claude-test-response.json | jq . 2>/dev/null || cat /tmp/claude-test-response.json
  exit 1

elif [ "$HTTP_CODE" -eq 429 ]; then
  echo -e "${RED}✗ Rate limit exceeded${NC}"
  echo "You may need to wait before making more API calls."
  echo
  cat /tmp/claude-test-response.json | jq . 2>/dev/null || cat /tmp/claude-test-response.json
  exit 1

else
  echo -e "${RED}✗ API request failed with status $HTTP_CODE${NC}"
  echo
  echo "Response:"
  cat /tmp/claude-test-response.json | jq . 2>/dev/null || cat /tmp/claude-test-response.json
  exit 1
fi

# Cleanup
rm -f /tmp/claude-test-response.json
