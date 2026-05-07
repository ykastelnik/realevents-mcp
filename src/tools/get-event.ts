import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiError, apiCall } from "../lib/api-client.js";
import { formatEvent } from "../lib/formatters.js";
import type { ApiEvent } from "../types.js";

const DEFAULT_PUBLIC_BASE = "https://realevents.co";

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function publicBase(): string {
  const env = process.env.REALEVENTS_PUBLIC_URL?.trim();
  return env && env.length > 0 ? env.replace(/\/$/, "") : DEFAULT_PUBLIC_BASE;
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export async function handleGetEvent(args: { slug: string }): Promise<ToolResult> {
  try {
    const data = await apiCall<{ event: ApiEvent }>("GET", `/events/${args.slug}`);
    return {
      content: [{ type: "text", text: formatEvent(data.event, publicBase()) }]
    };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    return errorResult(message);
  }
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
