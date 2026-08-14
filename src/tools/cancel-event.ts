import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse } from "../types.js";

export interface CancelEventInput {
  manage_token?: string;
}

export async function handleCancelEvent(input: CancelEventInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    const data = await apiCall<ApiManageEventResponse>("PATCH", `/manage/${token}`, {
      body: { event: { status: "cancelled" } }
    });

    return ok(
      [
        `Event "${data.event.title}" is now cancelled.`,
        "",
        "The event page is not deleted - it stays online showing the cancelled state,",
        "so guests who follow an old link understand what happened.",
        "To reinstate it, use update_event with status 'published'.",
        "",
        // Assistants were inventing "use the Rails console or admin" here, which is
        // wrong advice for an organizer. Deleting is deliberately not an MCP tool
        // (it destroys the guest list and comments irreversibly), but it IS a normal
        // button on the manage page - so name the real place.
        "To delete it permanently instead, open the manage page and use Delete there.",
        "That also removes the guest list and any comments, and cannot be undone.",
        "",
        `Public link: ${publicBase()}/e/${data.event.slug}`,
        `Manage page: ${publicBase()}/manage/${token}`
      ].join("\n")
    );
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted.")
};

export function registerCancelEvent(server: McpServer): void {
  server.registerTool(
    "cancel_event",
    {
      description: [
        "Cancel an event. This is visible to everyone who has the link, so confirm",
        "with the user before calling it. The page is NOT deleted: it stays online",
        "marked as cancelled. Reversible with update_event (status 'published'),",
        "though guests will already have seen the cancellation. Requires the manage token."
      ].join(" "),
      inputSchema
    },
    async (args) => handleCancelEvent(args)
  );
}
