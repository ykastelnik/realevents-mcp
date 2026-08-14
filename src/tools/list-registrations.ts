import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatRegistrations } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { ok, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse, RsvpStatus } from "../types.js";

export interface ListRegistrationsInput {
  manage_token?: string;
  status?: RsvpStatus;
}

export async function handleListRegistrations(input: ListRegistrationsInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    const data = await apiCall<ApiManageEventResponse>("GET", `/manage/${token}`);

    // Filtering happens here rather than server-side: the manage endpoint has no
    // status parameter, and one event's guest list is small enough that a second
    // round trip would cost more than it saves.
    const all = data.registrations;
    const guests = input.status ? all.filter((r) => r.status === input.status) : all;

    if (guests.length === 0) {
      const scope = input.status ? `${input.status} responses` : "registrations";
      return ok(`No ${scope} yet for "${data.event.title}".`);
    }

    const heading = input.status
      ? `${guests.length} ${input.status} for "${data.event.title}":`
      : `${guests.length} registrations for "${data.event.title}":`;

    return ok([heading, "", formatRegistrations(guests)].join("\n"));
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."),
  status: z
    .enum(["confirmed", "maybe", "declined"])
    .optional()
    .describe("Show only guests with this answer. Omit for the whole list.")
};

export function registerListRegistrations(server: McpServer): void {
  server.registerTool(
    "list_registrations",
    {
      description: [
        "List an event's guests, optionally filtered to one answer",
        "(confirmed / maybe / declined). Use this for questions like",
        '"who is coming?" or "who declined?". Shows plus-ones, guest notes and',
        "bounced invitation addresses. Requires the manage token."
      ].join(" "),
      inputSchema
    },
    async (args) => handleListRegistrations(args)
  );
}
