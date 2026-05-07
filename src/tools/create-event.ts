import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiCreateEventResponse } from "../types.js";

const ALLOWED_KEYS = [
  "title",
  "start_datetime",
  "format",
  "description",
  "location",
  "virtual_link",
  "max_attendees",
  "organizer_email"
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

export interface CreateEventInput {
  title: string;
  start_datetime: string;
  format?: "in_person" | "virtual" | "hybrid";
  description?: string;
  location?: string;
  virtual_link?: string;
  max_attendees?: number;
  organizer_email?: string;
}

function pickAllowed(input: CreateEventInput): Record<string, unknown> {
  const event: Record<string, unknown> = {};
  const source = input as unknown as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    const value = source[key as AllowedKey];
    if (value !== undefined && value !== null && value !== "") {
      event[key] = value;
    }
  }
  return event;
}

export async function handleCreateEvent(input: CreateEventInput): Promise<ToolResult> {
  return runTool(async () => {
    const body = { event: pickAllowed(input) };
    const data = await apiCall<ApiCreateEventResponse>("POST", "/events", { body });

    const base = publicBase();
    const lines = [
      `Event "${data.event.title}" created successfully.`,
      "",
      `Public link: ${base}/e/${data.event.slug}`,
      `Manage link: ${base}${data.manage_url}`,
      "",
      "Save the manage link - it's the only way to edit your event later.",
      "To set an end time or other details, use update_event with this manage token."
    ];
    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  title: z.string().min(1).describe("Event title (e.g. 'Bordeaux Tech Meetup')"),
  start_datetime: z
    .string()
    .min(1)
    .describe("Start date and time in ISO 8601 format (e.g. '2026-06-15T19:00:00Z')"),
  format: z
    .enum(["in_person", "virtual", "hybrid"])
    .optional()
    .describe("Event format. Default: in_person"),
  description: z.string().optional().describe("Event description (supports HTML)"),
  location: z
    .string()
    .optional()
    .describe("Physical location (for in_person or hybrid events)"),
  virtual_link: z
    .string()
    .optional()
    .describe("Virtual meeting link (for virtual or hybrid events)"),
  max_attendees: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of attendees (no limit if not set)"),
  organizer_email: z
    .string()
    .optional()
    .describe("Organizer email to receive the manage link by email")
};

export function registerCreateEvent(server: McpServer): void {
  server.registerTool(
    "create_event",
    {
      description: [
        "Creates an event page on RealEvents. The event is created with a start time only.",
        "To set an end time, duration, or to update other details (description, location,",
        "theme, cover image), use the update_event tool with the manage_token returned by",
        "this tool.",
        "Returns the public link, manage link, and slug. Save the manage link - it is the",
        "only way to edit the event later."
      ].join(" "),
      inputSchema
    },
    async (args) => handleCreateEvent(args)
  );
}
