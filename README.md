# RealEvents MCP Server

[![CI](https://github.com/ykastelnik/realevents-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/ykastelnik/realevents-mcp/actions/workflows/test.yml)
[![CodeQL](https://github.com/ykastelnik/realevents-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/ykastelnik/realevents-mcp/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/realevents-mcp.svg)](https://www.npmjs.com/package/realevents-mcp)
[![npm downloads](https://img.shields.io/npm/dm/realevents-mcp.svg)](https://www.npmjs.com/package/realevents-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Create and manage events on [RealEvents.co](https://realevents.co) directly from Claude, ChatGPT, Cursor, or any MCP-compatible AI assistant.

Documentation and install snippets: https://realevents.co/mcp

> Use version 1.0.2 or later. 1.0.0 and 1.0.1 are superseded by 1.0.2, which adds the `mcpName` field required by the MCP Registry.

## For maintainers — publishing checklist

Before publishing a new version:

1. Bump `version` in `package.json`
2. Verify `mcpName: "io.github.ykastelnik/realevents"` is still present
3. Bump `version` and `packages[0].version` in `server.json` to match
4. Tag `vX.Y.Z` and push: the `publish.yml` workflow handles the npm publish
5. Locally: `./mcp-publisher publish` to sync the MCP Registry listing

## Trust

This package is signed with [npm Provenance](https://docs.npmjs.com/generating-provenance-statements) and built from this public repository via GitHub Actions. Every published version on [npmjs.com/package/realevents-mcp](https://www.npmjs.com/package/realevents-mcp) is traceable back to the exact commit and workflow run that built it.
