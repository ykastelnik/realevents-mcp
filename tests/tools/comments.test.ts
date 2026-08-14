import { describe, expect, it } from "vitest";
import { handleListComments, handlePostComment } from "../../src/tools/comments.js";
import { setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    body: "See you there",
    author_role: "guest",
    author: "Ana",
    author_hue: 3,
    mine: false,
    reactions: [],
    created_at: "2026-08-14T10:00:00Z",
    ...overrides
  };
}

describe("list_comments tool", () => {
  const ctx = setupMockApi();

  it("renders the thread with each author and body", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(200, {
        comments: [
          comment({ id: 1, author: "Ana", body: "Can I bring a friend?" }),
          comment({ id: 2, author_role: "host", author: null, body: "Yes, plus-ones are on" })
        ],
        total: 2,
        has_more: false
      });

    const result = await handleListComments({ manage_token: "tok" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Ana");
    expect(text).toContain("Can I bring a friend?");
    expect(text).toContain("Yes, plus-ones are on");
  });

  // Host posts carry no author name (identity is the event), so rendering the raw
  // null would read as a nameless guest rather than the organizer.
  it("labels host posts as the organizer rather than a nameless guest", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(200, {
        comments: [comment({ author_role: "host", author: null, body: "Doors at 7" })],
        total: 1,
        has_more: false
      });

    const text = textOf(await handleListComments({ manage_token: "tok" }));
    expect(text).toMatch(/organizer|host/i);
    expect(text).not.toContain("null");
  });

  // A removed row keeps its place in the thread but carries no body or author.
  it("marks removed comments instead of rendering an empty line", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(200, {
        comments: [{ id: 9, removed: true, created_at: "2026-08-14T10:00:00Z" }],
        total: 1,
        has_more: false
      });

    const text = textOf(await handleListComments({ manage_token: "tok" }));
    expect(text).toMatch(/removed|deleted/i);
    expect(text).not.toContain("undefined");
  });

  it("says there are more comments when the thread is paginated", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(200, { comments: [comment()], total: 40, has_more: true });

    const text = textOf(await handleListComments({ manage_token: "tok" }));
    expect(text).toContain("40");
    expect(text).toMatch(/earlier|more/i);
  });

  it("walks back through older pages with before", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments?before=12" })
      .reply(200, { comments: [comment({ id: 5 })], total: 40, has_more: false });

    const result = await handleListComments({ manage_token: "tok", before: 12 });
    expect(result.isError).toBeFalsy();
  });

  it("reports an empty thread plainly", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(200, { comments: [], total: 0, has_more: false });

    const text = textOf(await handleListComments({ manage_token: "tok" }));
    expect(text).toMatch(/no comments/i);
  });

  // comments_live? is (global flag AND the event's own allow_comments), so a 403
  // here almost always means this organizer has not switched comments on. A bare
  // "Forbidden" would send the caller hunting for a permissions problem.
  it("explains a 403 as comments being switched off for this event", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok/comments" })
      .reply(403, {});

    const result = await handleListComments({ manage_token: "tok" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/allow_comments|not enabled|switched off/i);
    expect(textOf(result)).toContain("update_event");
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handleListComments({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });
});

describe("post_comment tool", () => {
  const ctx = setupMockApi();

  it("posts as the host and confirms what was published", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/manage/tok/comments",
        body: JSON.stringify({ comment: { body: "Doors open at 7pm" } })
      })
      .reply(201, {
        comment: {
          id: 4,
          body: "Doors open at 7pm",
          author_role: "host",
          created_at: "2026-08-14T10:00:00Z"
        }
      });

    const result = await handlePostComment({ manage_token: "tok", body: "Doors open at 7pm" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Doors open at 7pm");
    expect(text).toMatch(/organizer|host/i);
  });

  // Guests see host posts in their thread, so this is outbound communication, not a
  // private note. The result must say so or a model may treat it as scratch space.
  it("makes clear the post is visible to every guest", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/comments" })
      .reply(201, {
        comment: { id: 4, body: "Hi", author_role: "host", created_at: "2026-08-14T10:00:00Z" }
      });

    const text = textOf(await handlePostComment({ manage_token: "tok", body: "Hi" }));
    expect(text).toMatch(/guest|everyone|visible/i);
  });

  it("surfaces the 500-character limit when the API rejects a long body", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/comments" })
      .reply(422, { error: "Body is too long (maximum is 500 characters)" });

    const result = await handlePostComment({ manage_token: "tok", body: "x".repeat(600) });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("500");
  });

  it("explains a 403 the same way as the read side", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/comments" })
      .reply(403, {});

    const result = await handlePostComment({ manage_token: "tok", body: "Hi" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/allow_comments|not enabled|switched off/i);
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handlePostComment({ body: "Hi" });
    expect(result.isError).toBe(true);
  });
});
