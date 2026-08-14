import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCancelEvent } from "./tools/cancel-event.js";
import { registerCreateEvent } from "./tools/create-event.js";
import { registerDuplicateEvent } from "./tools/duplicate-event.js";
import { registerGetEvent } from "./tools/get-event.js";
import { registerGetEventStats } from "./tools/event-stats.js";
import { registerGetManageEvent } from "./tools/get-manage-event.js";
import { registerListPublicEvents } from "./tools/list-events.js";
import { registerListRegistrations } from "./tools/list-registrations.js";
import { registerForEvent } from "./tools/register.js";
import { registerUpdateEvent } from "./tools/update-event.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "realevents",
    version: "1.1.0"
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
const entry = process.argv[1];
const isDirectRun = entry !== undefined && import.meta.url === pathToFileURL(entry).href;

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`Fatal: failed to start realevents-mcp: ${err}\n`);
    process.exit(1);
  });
}
