import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatDate } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiEvent } from "../types.js";

interface ApiDuplicateResponse {
  event: ApiEvent;
  manage_url: string;
  has_organizer_email: boolean;
}

export interface DuplicateEventInput {
  manage_token?: string;
}

export async function handleDuplicateEvent(input: DuplicateEventInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    const data = await apiCall<ApiDuplicateResponse>("POST", `/manage/${token}/duplicate`, {
      body: {}
    });

    const base = publicBase();
    return ok(
      [
        `Copied "${data.event.title}".`,
        `New date: ${formatDate(data.event.start_datetime, data.event.timezone)}`,
        "",
        // The API deliberately creates the copy as a draft one week later, so it is
        // not publicly reachable until the organizer publishes it. Saying so stops a
        // caller handing out a link that 404s.
        "The copy is a DRAFT scheduled one week after the original, so it is not",
        "public yet. Adjust the date and title, then publish it with update_event",
        "(status 'published').",
        "",
        `Manage link: ${base}${data.manage_url}`,
        "Save this link - the copy has its own manage token, separate from the original."
      ].join("\n")
    );
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token of the event to copy. Falls back to REALEVENTS_MANAGE_TOKEN env var.")
};

export function registerDuplicateEvent(server: McpServer): void {
  server.registerTool(
    "duplicate_event",
    {
      description: [
        "Copy an existing event into a new draft, dated one week later, keeping its",
        "description, location and settings. Use this for \"set up next month's",
        'meetup like this one". Guests are NOT copied. Returns a new manage link;',
        "the copy must be published with update_event before anyone can see it."
      ].join(" "),
      inputSchema
    },
    async (args) => handleDuplicateEvent(args)
  );
}
