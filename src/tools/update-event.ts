import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatEvent } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { fail, ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse, PlusOnesDetail } from "../types.js";

const UPDATABLE_KEYS = [
  "title",
  "slug",
  "description",
  "location",
  "virtual_link",
  "start_datetime",
  "end_datetime",
  "timezone",
  "format",
  "status",
  "max_attendees",
  "theme",
  "listed",
  "organizer_email",
  "notify_on_registration",
  "social_sharing_enabled",
  "discoverable_in_search",
  "cover_layout",
  "allow_maybe",
  "allow_notes",
  "allow_comments",
  "plus_ones_limit",
  "plus_ones_detail"
] as const;

type UpdatableKey = (typeof UPDATABLE_KEYS)[number];

export interface UpdateEventInput {
  manage_token?: string;
  title?: string;
  slug?: string;
  description?: string;
  location?: string;
  virtual_link?: string;
  start_datetime?: string;
  end_datetime?: string;
  /** Explicit opt-in to remove an end time, since "" is filtered out below. */
  clear_end_datetime?: boolean;
  timezone?: string;
  format?: "in_person" | "virtual" | "hybrid";
  status?: "draft" | "published" | "cancelled";
  max_attendees?: number;
  theme?: string;
  listed?: boolean;
  organizer_email?: string;
  notify_on_registration?: boolean;
  social_sharing_enabled?: boolean;
  discoverable_in_search?: boolean;
  cover_layout?: string;
  allow_maybe?: boolean;
  allow_notes?: boolean;
  allow_comments?: boolean;
  plus_ones_limit?: number;
  plus_ones_detail?: PlusOnesDetail;
}

function pickUpdatable(input: UpdateEventInput): {
  keys: UpdatableKey[];
  body: Record<string, unknown>;
} {
  const keys: UpdatableKey[] = [];
  const body: Record<string, unknown> = {};
  for (const key of UPDATABLE_KEYS) {
    // eslint-disable-next-line security/detect-object-injection -- key is bounded by UPDATABLE_KEYS const array
    const value = (input as Record<string, unknown>)[key];
    // Only undefined/null/"" are skipped. `false` and `0` are meaningful here:
    // dropping them would make it impossible to turn a toggle off, or to set
    // plus_ones_limit back to 0 (disabled).
    if (value !== undefined && value !== null && value !== "") {
      keys.push(key);
      // eslint-disable-next-line security/detect-object-injection -- key is bounded by UPDATABLE_KEYS const array
      body[key] = value;
    }
  }

  // The API clears the column on a blank end_datetime, but the "" filter above eats
  // the blank, so an end time could be set and never removed. An explicit flag keeps
  // that escape hatch narrow instead of making every field nullable. A real
  // end_datetime wins: setting and clearing at once is contradictory.
  if (input.clear_end_datetime && !keys.includes("end_datetime")) {
    keys.push("end_datetime");
    body["end_datetime"] = "";
  }

  return { keys, body };
}

export async function handleUpdateEvent(input: UpdateEventInput): Promise<ToolResult> {
  return runTool(async () => {
    const { keys, body } = pickUpdatable(input);
    if (keys.length === 0) {
      return fail("Nothing to update. Provide at least one field to change.");
    }

    const token = resolveManageToken(input.manage_token);
    const data = await apiCall<ApiManageEventResponse>("PATCH", `/manage/${token}`, {
      body: { event: body }
    });

    const base = publicBase();
    const lines = [
      `Event "${data.event.title}" updated successfully.`,
      "",
      `Updated fields: ${keys.join(", ")}`,
      "",
      "Current state:",
      formatEvent(data.event, base),
      "",
      `Manage link: ${base}/manage/${token}`
    ];
    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."),
  title: z.string().optional().describe("New event title"),
  slug: z.string().optional().describe("New URL slug"),
  description: z.string().optional().describe("New description (supports HTML)"),
  location: z.string().optional().describe("New physical location"),
  virtual_link: z.string().optional().describe("New virtual meeting link"),
  start_datetime: z
    .string()
    .optional()
    .describe("New start date/time (ISO 8601), interpreted in the event's timezone"),
  end_datetime: z.string().optional().describe("New end date/time (ISO 8601)"),
  clear_end_datetime: z
    .boolean()
    .optional()
    .describe("Set true to remove the event's end time. Ignored if end_datetime is also given."),
  timezone: z
    .string()
    .optional()
    .describe("New IANA timezone, e.g. 'Europe/Paris'. Changes how start/end times are read."),
  format: z.enum(["in_person", "virtual", "hybrid"]).optional().describe("New event format"),
  status: z
    .enum(["draft", "published", "cancelled"])
    .optional()
    .describe("New event status (use 'cancelled' to cancel the event)"),
  max_attendees: z.number().int().min(1).optional().describe("New max attendees"),
  theme: z.string().optional(),
  listed: z.boolean().optional().describe("Whether the event is listed in the public directory"),
  organizer_email: z.string().optional(),
  notify_on_registration: z.boolean().optional(),
  social_sharing_enabled: z
    .boolean()
    .optional()
    .describe("Whether share buttons appear on the public page"),
  discoverable_in_search: z
    .boolean()
    .optional()
    .describe("Whether search engines may index the event page"),
  cover_layout: z
    .enum(["horizontal", "vertical"])
    .optional()
    .describe("How the cover image is displayed"),
  allow_maybe: z
    .boolean()
    .optional()
    .describe("Whether guests may answer 'maybe' as well as going / not going"),
  allow_notes: z
    .boolean()
    .optional()
    .describe("Whether the RSVP form offers guests a free-text note box"),
  allow_comments: z
    .boolean()
    .optional()
    .describe("Whether the guest comment thread is open on this event"),
  plus_ones_limit: z
    .number()
    .int()
    .min(0)
    .max(9)
    .optional()
    .describe("How many extra guests each attendee may bring. 0 disables plus-ones."),
  plus_ones_detail: z
    .enum(["count_only", "names"])
    .optional()
    .describe("Whether guests give a headcount only, or name each person they bring")
};

export function registerUpdateEvent(server: McpServer): void {
  server.registerTool(
    "update_event",
    {
      description:
        "Update an existing event by manage token. Only provide the fields you want to change. Use this to set end_datetime, change status (e.g. 'cancelled'), or update any other detail after creation.",
      inputSchema
    },
    async (args) => handleUpdateEvent(args)
  );
}
