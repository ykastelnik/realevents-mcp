import { describe, expect, it } from "vitest";
import { handleCancelEvent } from "../../src/tools/cancel-event.js";
import { makeEvent, setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("cancel_event tool", () => {
  const ctx = setupMockApi();

  it("sets the status to cancelled", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({ event: { status: "cancelled" } })
      })
      .reply(200, {
        event: makeEvent({ status: "cancelled", title: "Off" }),
        public_url: "/e/off",
        manage_url: "/manage/tok"
      });

    const result = await handleCancelEvent({ manage_token: "tok" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("cancelled");
    expect(textOf(result)).toContain("Off");
  });

  // Cancelling is the one destructive action in the tool set, and it is not
  // reversible from the guests' point of view - they have already been told.
  // The result must say the page stays up, so the model does not follow up by
  // "cleaning up" with a delete.
  it("explains that the page stays up rather than being deleted", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "PATCH", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ status: "cancelled" }),
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleCancelEvent({ manage_token: "tok" });
    expect(textOf(result)).toMatch(/not deleted|still|remains/i);
  });

  // Assistants were telling organizers to delete "from the Rails console or admin".
  // Deleting is deliberately not an MCP tool, but it is a normal button on the
  // manage page, so the result must point at the real place.
  it("points at the manage page for deletion, not a console", () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "PATCH", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ status: "cancelled" }),
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    return handleCancelEvent({ manage_token: "tok" }).then((result) => {
      const text = textOf(result);
      // Match the GUIDANCE sentence, not the "Manage page:" link label - a bare
      // /manage page/i also matches the link, so it passed with the advice deleted.
      expect(text).toMatch(/to delete it permanently/i);
      expect(text).toContain("/manage/tok");
      expect(text).not.toMatch(/rails console|admin panel/i);
    });
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handleCancelEvent({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });

  it("surfaces an API rejection", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "PATCH", path: "/api/v1/manage/tok" })
      .reply(422, { error: "Event already cancelled" });

    const result = await handleCancelEvent({ manage_token: "tok" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("already cancelled");
  });
});
