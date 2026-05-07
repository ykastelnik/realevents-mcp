import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCreateEvent } from "./tools/create-event.js";
import { registerGetEvent } from "./tools/get-event.js";
import { registerGetManageEvent } from "./tools/get-manage-event.js";
import { registerListPublicEvents } from "./tools/list-events.js";
import { registerForEvent } from "./tools/register.js";
import { registerUpdateEvent } from "./tools/update-event.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "realevents",
    version: "1.0.0"
  });

  registerCreateEvent(server);
  registerGetEvent(server);
  registerGetManageEvent(server);
  registerListPublicEvents(server);
  registerForEvent(server);
  registerUpdateEvent(server);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal: failed to start realevents-mcp:", err);
  process.exit(1);
});
