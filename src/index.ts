import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCancelEvent } from "./tools/cancel-event.js";
import { registerListComments, registerPostComment } from "./tools/comments.js";
import { registerCreateEvent } from "./tools/create-event.js";
import { registerDuplicateEvent } from "./tools/duplicate-event.js";
import { registerGetEvent } from "./tools/get-event.js";
import { registerGetEventStats } from "./tools/event-stats.js";
import { registerGetManageEvent } from "./tools/get-manage-event.js";
import { registerListPublicEvents } from "./tools/list-events.js";
import { registerListRegistrations } from "./tools/list-registrations.js";
import { registerSetCover } from "./tools/set-cover.js";
import { registerForEvent } from "./tools/register.js";
import { registerUpdateEvent } from "./tools/update-event.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "realevents",
    version: "1.3.0"
  });

  registerCreateEvent(server);
  registerGetEvent(server);
  registerGetManageEvent(server);
  registerListPublicEvents(server);
  registerForEvent(server);
  registerUpdateEvent(server);
  registerListRegistrations(server);
  registerGetEventStats(server);
  registerCancelEvent(server);
  registerDuplicateEvent(server);
  registerListComments(server);
  registerPostComment(server);
  registerSetCover(server);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the transport when this file IS the process entry point. Importing the
// module (the tests do, to assert every tool is actually wired into the server) must
// not open a stdio connection as a side effect.
//
// Both sides are realpath'd first: import.meta.url resolves symlinks while
// process.argv[1] does not, so comparing them raw made the server silently refuse to
// start whenever it was installed under a symlinked path. On macOS that is every
// /tmp directory (really /private/tmp), i.e. any `npm install` into a temp project.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- entry is process.argv[1], this process's own entry point, not user input
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    // Entry path unreadable: fall back to a raw comparison rather than never starting.
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    process.stderr.write(`Fatal: failed to start realevents-mcp: ${err}\n`);
    process.exit(1);
  });
}
