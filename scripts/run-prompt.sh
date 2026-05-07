#!/usr/bin/env bash
# Send a JSON-RPC tools/call to the local MCP binary against production API.
# Usage: ./scripts/run-prompt.sh '{"name":"get_event","arguments":{"slug":"realevents-mcp-smoke-test"}}'
set -euo pipefail

REALEVENTS_API_URL="${REALEVENTS_API_URL:-https://realevents.co/api/v1}"
PARAMS="$1"

REQUEST=$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"prompt-runner","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":${PARAMS}}
EOF
)

echo "$REQUEST" | REALEVENTS_API_URL="$REALEVENTS_API_URL" node dist/index.js 2>/dev/null | tail -1 | jq -r '.result.content[0].text // .error.message // (. | tostring)'
