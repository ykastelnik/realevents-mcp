import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiCall } from "../lib/api-client.js";
import { formatDate } from "../lib/formatters.js";
import { ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiRegisterResponse } from "../types.js";

export interface RegisterInput {
  slug: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

function buildRegistrationBody(input: RegisterInput): Record<string, unknown> {
  const reg: Record<string, unknown> = { email: input.email };
  if (input.first_name) reg["first_name"] = input.first_name;
  if (input.last_name) reg["last_name"] = input.last_name;
  return reg;
}

export async function handleRegisterForEvent(input: RegisterInput): Promise<ToolResult> {
  return runTool(async () => {
    const data = await apiCall<ApiRegisterResponse>(
      "POST",
      `/events/${input.slug}/registrations`,
      { body: { registration: buildRegistrationBody(input) } }
    );

    const namePart = [data.registration.first_name, data.registration.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const identity = namePart.length > 0 ? `${namePart} (${data.registration.email})` : data.registration.email;

    const lines: string[] = [
      `${identity} is registered for "${data.event.title}".`,
      `Status: ${data.registration.status}`,
      `Date: ${formatDate(data.event.start_datetime)}`
    ];
    if (data.virtual_link) lines.push(`Virtual link: ${data.virtual_link}`);
    lines.push("", `Public link: ${publicBase()}/e/${data.event.slug}`);

    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  slug: z.string().min(1).describe("Event slug (the part after /e/ in the URL)"),
  email: z.string().min(3).describe("Attendee email address"),
  first_name: z.string().optional().describe("Attendee first name (optional)"),
  last_name: z.string().optional().describe("Attendee last name (optional)")
};

export function registerForEvent(server: McpServer): void {
  server.registerTool(
    "register_for_event",
    {
      description:
        "Register an attendee for a public event by slug. Returns confirmation with status and event date.",
      inputSchema
    },
    async (args) => handleRegisterForEvent(args)
  );
}
