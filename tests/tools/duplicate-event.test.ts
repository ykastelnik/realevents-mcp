import { describe, expect, it } from "vitest";
import { handleDuplicateEvent } from "../../src/tools/duplicate-event.js";
import { makeEvent, setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("duplicate_event tool", () => {
  const ctx = setupMockApi();

  it("creates the copy and hands back its own manage link", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/duplicate" })
      .reply(201, {
        event: makeEvent({ title: "Copie de Meetup", slug: "copie-de-meetup", status: "draft" }),
        manage_url: "/manage/new-tok",
        has_organizer_email: true
      });

    const result = await handleDuplicateEvent({ manage_token: "tok" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("new-tok");
    // The copy has its OWN manage token; losing it means losing the new event.
    expect(text).toMatch(/save|manage link/i);
  });

  // The API creates the copy as a draft, one week out. A caller that assumes the
  // duplicate is live would tell the organizer to share a link that 404s publicly.
  it("says the copy is a draft that still needs publishing", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/duplicate" })
      .reply(201, {
        event: makeEvent({ status: "draft" }),
        manage_url: "/manage/new-tok",
        has_organizer_email: false
      });

    const result = await handleDuplicateEvent({ manage_token: "tok" });
    expect(textOf(result)).toMatch(/draft/i);
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handleDuplicateEvent({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });

  it("surfaces an API rejection", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/manage/tok/duplicate" })
      .reply(422, { error: "Could not duplicate" });

    const result = await handleDuplicateEvent({ manage_token: "tok" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Could not duplicate");
  });
});
