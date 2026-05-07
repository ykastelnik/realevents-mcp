# RealEvents MCP Server

Create and manage events on [RealEvents](https://realevents.co) from any MCP-compatible AI assistant.

[![CI](https://github.com/ykastelnik/realevents-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/ykastelnik/realevents-mcp/actions/workflows/test.yml)
[![CodeQL](https://github.com/ykastelnik/realevents-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/ykastelnik/realevents-mcp/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/realevents-mcp.svg)](https://www.npmjs.com/package/realevents-mcp)
[![npm downloads](https://img.shields.io/npm/dm/realevents-mcp.svg)](https://www.npmjs.com/package/realevents-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Documentation and install snippets: https://realevents.co/mcp

## Install

```json
{
  "mcpServers": {
    "realevents": {
      "command": "npx",
      "args": ["-y", "realevents-mcp"]
    }
  }
}
```

For Claude Desktop on macOS, the config file is at `~/Library/Application Support/Claude/claude_desktop_config.json`. For other clients, see their MCP documentation.

## Tools

| Tool | Description |
|------|-------------|
| `list_public_events` | Browse upcoming public events |
| `get_event` | Get details of an event by slug |
| `create_event` | Create a new event page |
| `register_for_event` | Register an attendee |
| `get_manage_event` | View an event's details and registrations (requires manage_token) |
| `update_event` | Update event details (requires manage_token) |

## Manage token

Events created with `create_event` return a `manage_token`. Save it — it is the only way to manage the event later.

To set a default token so you don't have to pass it on every call:

```json
{
  "mcpServers": {
    "realevents": {
      "command": "npx",
      "args": ["-y", "realevents-mcp"],
      "env": {
        "REALEVENTS_MANAGE_TOKEN": "your-token"
      }
    }
  }
}
```

## Security

Signed with [npm Provenance](https://docs.npmjs.com/generating-provenance-statements), built from this repository via GitHub Actions. Every published version is traceable back to the exact commit and workflow run that built it.

## Links

- [realevents.co](https://realevents.co)
- [Documentation](https://realevents.co/mcp)
- [GitHub repository](https://github.com/ykastelnik/realevents-mcp)
- [MCP Registry listing](https://registry.modelcontextprotocol.io/v0/servers?search=realevents)

## For maintainers — publishing checklist

Before publishing a new version:

1. Bump `version` in `package.json`
2. Verify `mcpName: "io.github.ykastelnik/realevents"` is still present
3. Bump `version` and `packages[0].version` in `server.json` to match
4. Tag `vX.Y.Z` and push: the `publish.yml` workflow handles the npm publish
5. Locally: `./mcp-publisher publish` to sync the MCP Registry listing

## License

MIT
