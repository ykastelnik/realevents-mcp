import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatEvent } from "../lib/formatters.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiEvent } from "../types.js";

export async function handleGetEvent(args: { slug: string }): Promise<ToolResult> {
  return runTool(async () => {
    const data = await apiCall<{ event: ApiEvent }>("GET", `/events/${args.slug}`);
    return ok(formatEvent(data.event, publicBase()));
  });
}

const inputSchema = {
  slug: z
    .string()
    .min(1)
    .describe("Event slug (the part after /e/ in the URL, e.g. 'bordeaux-tech-meetup')")
};

export function registerGetEvent(server: McpServer): void {
  server.registerTool(
    "get_event",
    {
      description:
        "Get details of a public event by its slug. Returns title, date, location, registration count, and description.",
      inputSchema
    },
    async (args) => handleGetEvent(args)
  );
}
