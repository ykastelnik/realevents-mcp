import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatEvent } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { fail, ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiManageEventResponse } from "../types.js";

const UPDATABLE_KEYS = [
  "title",
  "slug",
  "description",
  "location",
  "virtual_link",
  "start_datetime",
  "end_datetime",
  "format",
  "status",
  "max_attendees",
  "theme",
  "listed",
  "organizer_email",
  "notify_on_registration"
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
  format?: "in_person" | "virtual" | "hybrid";
  status?: "draft" | "published" | "cancelled";
  max_attendees?: number;
  theme?: string;
  listed?: boolean;
  organizer_email?: string;
  notify_on_registration?: boolean;
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
    if (value !== undefined && value !== null && value !== "") {
      keys.push(key);
      // eslint-disable-next-line security/detect-object-injection -- key is bounded by UPDATABLE_KEYS const array
      body[key] = value;
    }
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
  start_datetime: z.string().optional().describe("New start date/time (ISO 8601)"),
  end_datetime: z.string().optional().describe("New end date/time (ISO 8601)"),
  format: z.enum(["in_person", "virtual", "hybrid"]).optional().describe("New event format"),
  status: z
    .enum(["draft", "published", "cancelled"])
    .optional()
    .describe("New event status (use 'cancelled' to cancel the event)"),
  max_attendees: z.number().int().min(1).optional().describe("New max attendees"),
  theme: z.string().optional(),
  listed: z.boolean().optional().describe("Whether the event is listed in the public directory"),
  organizer_email: z.string().optional(),
  notify_on_registration: z.boolean().optional()
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
