import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiError, apiCall } from "../lib/api-client.js";
import { formatDate } from "../lib/formatters.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { fail, ok, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiCommentThread, ApiHostComment, ApiThreadComment } from "../types.js";

// comments_live? is (the global event_comments flag AND the event's own
// allow_comments). The global flag was verified ON in production when these tools
// shipped, so a 403 in practice means this organizer has not switched comments on
// for their event - the case update_event fixes. Saying "Forbidden" would send the
// caller hunting for a permissions problem that does not exist.
//
// The message deliberately does not promise the fix will work: a 403 alone cannot
// tell the two causes apart, so it tells the caller to stop rather than retry if
// update_event succeeds and the thread is still unavailable. That keeps the advice
// honest if the flag is ever switched back off.
const COMMENTS_OFF =
  "The comment thread is not available for this event. Usually the organizer has " +
  "not enabled it: turn it on with update_event (allow_comments: true), then try " +
  "again. If update_event reports success and this still fails, comments are off " +
  "account-wide - do not keep retrying.";

function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

function formatThreadComment(comment: ApiThreadComment): string {
  const when = formatDate(comment.created_at);
  if (comment.removed) return `[removed] - ${when}`;

  // Host rows carry no author (identity is the event), so name them explicitly
  // rather than rendering a null that reads as a nameless guest.
  const who = comment.author_role === "host" ? "Organizer" : (comment.author ?? "Guest");
  const reactions = (comment.reactions ?? []).map((r) => `${r.emoji}${r.count}`).join(" ");

  const header = reactions ? `${who} - ${when} - ${reactions}` : `${who} - ${when}`;
  return `${header}\n   ${comment.body ?? ""}`;
}

export interface ListCommentsInput {
  manage_token?: string;
  before?: number;
}

export async function handleListComments(input: ListCommentsInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    let data: ApiCommentThread;
    try {
      data = await apiCall<ApiCommentThread>("GET", `/manage/${token}/comments`, {
        query: { before: input.before }
      });
    } catch (err) {
      if (isForbidden(err)) return fail(COMMENTS_OFF);
      throw err;
    }

    if (data.comments.length === 0) return ok("No comments on this event yet.");

    const lines = [
      `${data.total} ${data.total === 1 ? "comment" : "comments"} on this event:`,
      "",
      ...data.comments.map(formatThreadComment)
    ];

    // The thread pages from newest backwards, so "earlier" is the correct direction.
    if (data.has_more) {
      const oldest = data.comments[0]?.id;
      lines.push("", `Earlier comments exist. Pass before: ${oldest} to load the previous page.`);
    }

    return ok(lines.join("\n"));
  });
}

export interface PostCommentInput {
  manage_token?: string;
  body: string;
}

export async function handlePostComment(input: PostCommentInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);
    let data: { comment: ApiHostComment };
    try {
      data = await apiCall<{ comment: ApiHostComment }>("POST", `/manage/${token}/comments`, {
        body: { comment: { body: input.body } }
      });
    } catch (err) {
      if (isForbidden(err)) return fail(COMMENTS_OFF);
      throw err;
    }

    return ok(
      [
        "Posted to the event thread as the organizer.",
        "Every guest who has RSVPed can see it.",
        "",
        data.comment.body
      ].join("\n")
    );
  });
}

const listSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."),
  before: z
    .number()
    .int()
    .optional()
    .describe("Comment id to page backwards from. Omit for the most recent page.")
};

const postSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."),
  body: z
    .string()
    .min(1)
    .max(500)
    .describe("The message to post, max 500 characters. Plain text; HTML is stripped.")
};

export function registerListComments(server: McpServer): void {
  server.registerTool(
    "list_comments",
    {
      description: [
        "Read the guest conversation on an event: questions guests asked, the",
        "organizer's replies, and reaction tallies. Returns the most recent page,",
        "oldest first, with a cursor for earlier ones. Requires the manage token.",
        "Only works when the organizer has enabled comments on the event."
      ].join(" "),
      inputSchema: listSchema
    },
    async (args) => handleListComments(args)
  );
}

export function registerPostComment(server: McpServer): void {
  server.registerTool(
    "post_comment",
    {
      description: [
        "Post a message to an event's comment thread as the organizer.",
        "This is visible to every guest who has RSVPed, so confirm the wording with",
        "the user before posting. Use it to answer a question or share a practical",
        "update (parking, timing, what to bring). Requires the manage token."
      ].join(" "),
      inputSchema: postSchema
    },
    async (args) => handlePostComment(args)
  );
}
