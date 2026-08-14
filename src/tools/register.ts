import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatDate } from "../lib/formatters.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiRegisterResponse, RsvpStatus } from "../types.js";

export interface RegisterInput {
  slug: string;
  email: string;
  first_name: string;
  last_name?: string;
  status?: RsvpStatus;
  response_note?: string;
  plus_ones_count?: number;
  plus_one_names?: string[];
}

function buildRegistrationBody(input: RegisterInput): Record<string, unknown> {
  const reg: Record<string, unknown> = { email: input.email };
  if (input.first_name) reg["first_name"] = input.first_name;
  if (input.last_name) reg["last_name"] = input.last_name;
  if (input.status) reg["status"] = input.status;
  if (input.response_note) reg["response_note"] = input.response_note;

  // Plus-ones only attach to a confirmed response: the API rejects a positive count
  // on maybe/declined outright. Sending them regardless would turn an innocent
  // "they might come, and would bring two friends" into a hard 422.
  if (input.status === undefined || input.status === "confirmed") {
    if (input.plus_ones_count) reg["plus_ones_count"] = input.plus_ones_count;
    if (input.plus_one_names?.length) reg["plus_one_names"] = input.plus_one_names;
  }
  return reg;
}

export async function handleRegisterForEvent(input: RegisterInput): Promise<ToolResult> {
  return runTool(async () => {
    const sent = buildRegistrationBody(input);
    const data = await apiCall<ApiRegisterResponse>("POST", `/events/${input.slug}/registrations`, {
      body: { registration: sent }
    });

    const namePart = [data.registration.first_name, data.registration.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const identity =
      namePart.length > 0 ? `${namePart} (${data.registration.email})` : data.registration.email;

    const status = data.registration.status;
    // "Registered" is only true of a confirmed row; saying it for a decline would
    // misreport what the organizer will see.
    const verb =
      status === "confirmed"
        ? `is registered for "${data.event.title}"`
        : `responded "${status}" to "${data.event.title}"`;

    const lines: string[] = [`${identity} ${verb}.`, `Status: ${status}`];

    // The PUBLIC register endpoint's registration_json is
    // {id, email, first_name, last_name, status, response_note} - it does NOT echo
    // plus-ones (only the manage payload does). Reading them off the response meant
    // this line never rendered, so a booked party of three was confirmed with no
    // mention of the guests.
    //
    // The COUNT falls back to what was sent: the API rejects (422) any count it will
    // not honour - non-confirmed, over-limit, or unnamed under `names` detail - so a
    // 201 means exactly that count was stored. `sent` also carries the status gating,
    // so a maybe/declined response cannot claim a party.
    //
    // The NAMES deliberately do NOT fall back. On a `count_only` event the API
    // silently discards them (`attrs[:plus_one_names] = []`) and still returns 201,
    // so echoing what we sent would name guests absent from the organizer's list and
    // contradict list_registrations, which reads the manage payload and correctly
    // shows a bare "+2". A bare count is the honest rendering when we cannot confirm
    // the names were kept.
    const plusOnes = data.registration.plus_ones_count ?? (sent["plus_ones_count"] as number) ?? 0;
    if (plusOnes > 0) {
      const names = (data.registration.plus_one_names ?? []).filter(Boolean);
      const suffix = names.length > 0 ? ` (${names.join(", ")})` : "";
      lines.push(`Bringing: +${plusOnes}${suffix}`);
    }
    if (data.registration.response_note) lines.push(`Note: ${data.registration.response_note}`);

    lines.push(`Date: ${formatDate(data.event.start_datetime, data.event.timezone)}`);
    if (data.virtual_link) lines.push(`Virtual link: ${data.virtual_link}`);
    lines.push("", `Public link: ${publicBase()}/e/${data.event.slug}`);

    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  slug: z.string().min(1).describe("Event slug (the part after /e/ in the URL)"),
  email: z.string().min(3).describe("Attendee email address"),
  first_name: z
    .string()
    .min(1)
    .describe("Attendee first name. Required: the API rejects an RSVP without one."),
  last_name: z.string().optional().describe("Attendee last name (optional)"),
  status: z
    .enum(["confirmed", "maybe", "declined"])
    .optional()
    .describe(
      "The guest's answer. Default: confirmed. 'maybe' is only accepted when the " +
        "event has maybe responses enabled (check get_event first)."
    ),
  response_note: z
    .string()
    .max(500)
    .optional()
    .describe("Optional note for the organizer, e.g. dietary needs. Max 500 characters."),
  plus_ones_count: z
    .number()
    .int()
    .min(0)
    .max(9)
    .optional()
    .describe(
      "How many extra guests this person brings. Only valid with status 'confirmed', " +
        "and only up to the event's plus-ones limit (get_event reports it; 0 means " +
        "plus-ones are disabled)."
    ),
  plus_one_names: z
    .array(z.string())
    .optional()
    .describe(
      "Names of the extra guests. Required, one per guest, when the event collects " +
        "names rather than a bare count (get_event reports which)."
    )
};

export function registerForEvent(server: McpServer): void {
  server.registerTool(
    "register_for_event",
    {
      description: [
        "RSVP to a public event by slug, on behalf of an attendee.",
        "Records going / maybe / not going, an optional note, and any extra guests.",
        "Capacity is counted in PEOPLE, not rows: a guest bringing 3 others takes 4",
        "places, so a party can be refused on an event that still shows free seats.",
        "If the call is refused for capacity, the error states how many places remain -",
        "retry with a smaller party rather than reporting failure."
      ].join(" "),
      inputSchema
    },
    async (args) => handleRegisterForEvent(args)
  );
}
