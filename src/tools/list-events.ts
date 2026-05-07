import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatDirectory } from "../lib/formatters.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiDirectoryResponse } from "../types.js";

export interface ListPublicEventsInput {
  format?: "in_person" | "virtual" | "hybrid";
  search?: string;
  date?: "today" | "this_week" | "this_month";
  page?: number;
  per_page?: number;
}

export async function handleListPublicEvents(
  args: ListPublicEventsInput
): Promise<ToolResult> {
  return runTool(async () => {
    const data = await apiCall<ApiDirectoryResponse>("GET", "/directory", {
      query: args as Record<string, string | number | undefined>
    });
    return ok(formatDirectory(data, publicBase()));
  });
}

const inputSchema = {
  format: z
    .enum(["in_person", "virtual", "hybrid"])
    .optional()
    .describe("Filter by event format"),
  search: z
    .string()
    .optional()
    .describe("Search events by title (partial match)"),
  date: z
    .enum(["today", "this_week", "this_month"])
    .optional()
    .describe("Filter by date range"),
  page: z.number().int().min(1).optional().describe("Page number, 1-indexed"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Items per page, max 50")
};

export function registerListPublicEvents(server: McpServer): void {
  server.registerTool(
    "list_public_events",
    {
      description:
        "Browse upcoming public events on RealEvents. Filter by format, date range, or search term. Returns titles, dates, locations, and public links.",
      inputSchema
    },
    async (args) => handleListPublicEvents(args)
  );
}
