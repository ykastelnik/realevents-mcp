import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatDate } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { ok, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse } from "../types.js";

export interface GetEventStatsInput {
  manage_token?: string;
}

export async function handleGetEventStats(input: GetEventStatsInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    const { event, registrations } = await apiCall<ApiManageEventResponse>(
      "GET",
      `/manage/${token}`
    );

    const views = event.page_views ?? 0;
    const going = event.registrations_count;
    const declined = registrations.filter((r) => r.status === "declined").length;

    const lines: string[] = [
      `Stats for "${event.title}"`,
      `Date: ${formatDate(event.start_datetime, event.timezone)}`,
      "",
      `Page views: ${views}`,
      // Head-count, so it can exceed the number of rows when guests bring others.
      `Going: ${going} people`
    ];

    if (event.allow_maybe && event.maybe_registrations_count != null) {
      lines.push(`Maybe: ${event.maybe_registrations_count}`);
    }
    if (declined > 0) lines.push(`Declined: ${declined}`);
    if (event.max_attendees != null) {
      // The manage payload does not carry places_remaining (only the public event
      // does), so defaulting it to 0 reported "0 left" on an event with most of its
      // seats free. Derive it from the head-count, clamped so an over-subscribed
      // event reads 0 rather than a negative number.
      const left = event.places_remaining ?? Math.max(0, event.max_attendees - going);
      lines.push(`Capacity: ${going}/${event.max_attendees} (${left} left)`);
    }

    // Views-to-attendance is the number that separates "nobody is seeing the page"
    // from "people see it and do not sign up". Guarded against a page with no views
    // yet, which would otherwise render NaN.
    if (views > 0) {
      lines.push(`Conversion: ${Math.round((going / views) * 100)}% of visitors are attending`);
    }

    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted.")
};

export function registerGetEventStats(server: McpServer): void {
  server.registerTool(
    "get_event_stats",
    {
      description: [
        "Performance summary for one event: page views, how many people are coming,",
        "maybes, declines, remaining capacity and the view-to-attendance rate.",
        'Use this for "how is my event doing?". Requires the manage token.'
      ].join(" "),
      inputSchema
    },
    async (args) => handleGetEventStats(args)
  );
}
