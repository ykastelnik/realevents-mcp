import { describe, expect, it } from "vitest";
import { handleUpdateEvent } from "../../src/tools/update-event.js";
import { makeEvent, setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("update_event tool", () => {
  const ctx = setupMockApi();

  it("sends only the changed fields wrapped in { event: ... }", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok-abc",
        body: JSON.stringify({ event: { title: "New title", location: "Paris" } })
      })
      .reply(200, {
        event: makeEvent({ title: "New title", location: "Paris" }),
        public_url: "/e/x",
        manage_url: "/manage/tok-abc"
      });

    const result = await handleUpdateEvent({
      manage_token: "tok-abc",
      title: "New title",
      location: "Paris"
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("updated successfully");
    expect(text).toContain("Updated fields: title, location");
    expect(text).toContain("https://realevents.co/manage/tok-abc");
  });

  it("falls back to REALEVENTS_MANAGE_TOKEN env var", async () => {
    process.env.REALEVENTS_MANAGE_TOKEN = "env-token";
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/env-token",
        body: JSON.stringify({ event: { status: "cancelled" } })
      })
      .reply(200, {
        event: makeEvent({ status: "cancelled" }),
        public_url: "/e/x",
        manage_url: "/manage/env-token"
      });

    const result = await handleUpdateEvent({ status: "cancelled" });
    expect(result.isError).toBeFalsy();
  });

  it("returns 'Nothing to update' without an HTTP call when only manage_token is given", async () => {
    const result = await handleUpdateEvent({ manage_token: "tok" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Nothing to update");
  });

  it("returns isError when manage_token is missing", async () => {
    const result = await handleUpdateEvent({ title: "x" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });

  it("returns isError when the API rejects", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "PATCH", path: "/api/v1/manage/tok" })
      .reply(422, { error: "Slug already taken" });

    const result = await handleUpdateEvent({ manage_token: "tok", slug: "taken" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Slug already taken");
  });
});
