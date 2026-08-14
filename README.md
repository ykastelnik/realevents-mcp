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

Public, no token needed:

| Tool | Description |
|------|-------------|
| `list_public_events` | Browse upcoming public events. Filter by format, date range or search term. |
| `get_event` | Get an event's public details by slug. Follows old links after a slug change. |
| `register_for_event` | RSVP for an attendee: going, maybe or not going, with plus-ones and a note. |
| `create_event` | Create a new event page. Returns the public link and the manage link. |

Organizer tools, all requiring the manage token:

| Tool | Description |
|------|-------------|
| `get_manage_event` | Full event details plus the guest list. |
| `list_registrations` | The guest list on its own, optionally filtered to confirmed / maybe / declined. |
| `get_event_stats` | Page views, head-count, remaining capacity, view-to-attendance rate. |
| `update_event` | Change any event detail or setting. |
| `duplicate_event` | Copy the event into a new draft one week later. |
| `cancel_event` | Mark the event cancelled. The page stays online. |
| `list_comments` | Read the guest conversation: questions, replies and reactions. |
| `post_comment` | Post to the thread as the organizer. Visible to every guest who RSVPed. |

Comments only work on events where the organizer has switched them on
(`update_event` with `allow_comments: true`). Until then both comment tools return
a message saying exactly that.

### Timezones

`create_event` takes a `timezone` (an IANA name such as `Europe/Paris`) alongside
`start_datetime`. **Set it.** The start time is interpreted in that zone, and the
zone defaults to UTC, so creating an event for `19:00` without one produces a page
that reads 19:00 UTC: the wrong hour for everyone outside it.

Prefer a local time with no trailing `Z`:

```
start_datetime: "2026-06-15T19:00:00"
timezone:       "Europe/Paris"
```

### Attendance is counted in people

An event's attendance figure is a head-count: confirmed guests plus everyone they
bring. A guest arriving with three others takes four of the available places, so a
party can be refused on an event that still shows free rows. When that happens the
error states how many places are left, so the call can be retried with a smaller
party rather than reported as a failure.

Plus-ones only attach to a `confirmed` answer, and are capped by the event's own
`plus_ones_limit` (0 disables them). When the organizer collects names rather than
a headcount, every declared guest needs one. `get_event` reports both settings.

## Manage token

Events created with `create_event` return a `manage_token`. Save it: it is the only
way to manage the event later.

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

## For maintainers: publishing checklist

Before publishing a new version:

1. Bump `version` in `package.json`
2. Verify `mcpName: "io.github.ykastelnik/realevents"` is still present
3. Bump `version` and `packages[0].version` in `server.json` to match
4. Tag `vX.Y.Z` and push: the `publish.yml` workflow handles the npm publish
5. Locally: `./mcp-publisher publish` to sync the MCP Registry listing

## License

MIT
