import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatManageEvent } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse } from "../types.js";

export interface GetManageEventInput {
  manage_token?: string;
}

export async function handleGetManageEvent(input: GetManageEventInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    const data = await apiCall<ApiManageEventResponse>("GET", `/manage/${token}`);
    return ok(formatManageEvent(data.event, data.registrations, token, publicBase()));
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe(
      "Manage token from the /manage/{token} URL. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."
    )
};

export function registerGetManageEvent(server: McpServer): void {
  server.registerTool(
    "get_manage_event",
    {
      description:
        "Get full event details including the registrations list. Requires the manage token (the secret part of the manage URL) or REALEVENTS_MANAGE_TOKEN env var.",
      inputSchema
    },
    async (args) => handleGetManageEvent(args)
  );
}
