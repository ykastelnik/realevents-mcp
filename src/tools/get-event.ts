import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatEvent } from "../lib/formatters.js";
import { fail, ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import { isSlugRedirect, type ApiPublicEventResponse } from "../types.js";

export async function handleGetEvent(args: { slug: string }): Promise<ToolResult> {
  return runTool(async () => {
    // A retired slug answers 200 with { redirect: true, slug } instead of { event },
    // so an old shared link still resolves. Reading .event off that body returned
    // undefined and crashed the tool. Follow exactly one hop: the API only ever points
    // at a live slug, so a second hop means an inconsistent history we must not chase.
    const first = await apiCall<ApiPublicEventResponse>("GET", `/events/${args.slug}`);
    if (!isSlugRedirect(first)) {
      return ok(formatEvent(first.event, publicBase()));
    }

    const moved = await apiCall<ApiPublicEventResponse>("GET", `/events/${first.slug}`);
    if (isSlugRedirect(moved)) {
      return fail(
        `Event "${args.slug}" redirects to "${first.slug}", which redirects again. ` +
          "Refusing to follow further; this event's slug history looks inconsistent."
      );
    }

    return ok(
      [
        `Note: "${args.slug}" is an old address - this event now lives at "${first.slug}".`,
        "",
        formatEvent(moved.event, publicBase())
      ].join("\n")
    );
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
