import { ApiError } from "./api-client.js";
import { ManageTokenMissingError } from "./manage-token.js";

const DEFAULT_PUBLIC_BASE = "https://realevents.co";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function publicBase(): string {
  const env = process.env.REALEVENTS_PUBLIC_URL?.trim();
  return env && env.length > 0 ? env.replace(/\/$/, "") : DEFAULT_PUBLIC_BASE;
}

export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export async function runTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ManageTokenMissingError) return fail(err.message);
    if (err instanceof ApiError) return fail(err.message);
    if (err instanceof Error) return fail(err.message);
    return fail(String(err));
  }
}
