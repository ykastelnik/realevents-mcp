import { describe, expect, it } from "vitest";
import { handleGetManageEvent } from "../../src/tools/get-manage-event.js";
import {
  makeEvent,
  makeRegistration,
  setupMockApi,
  TEST_API_HOST,
  textOf
} from "../helpers/mock-fetch.js";

describe("get_manage_event tool", () => {
  const ctx = setupMockApi();

  it("returns the manage view with registrations when token is provided", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok-abc" })
      .reply(200, {
        event: makeEvent({ page_views: 42, location: "Bordeaux" }),
        registrations: [makeRegistration()],
        public_url: "/e/bordeaux-tech-meetup",
        manage_url: "/manage/tok-abc"
      });

    const result = await handleGetManageEvent({ manage_token: "tok-abc" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Bordeaux Tech Meetup (manage view)");
    expect(text).toContain("Page views: 42");
    expect(text).toContain("Marie Dupont");
    expect(text).toContain("https://realevents.co/manage/tok-abc");
  });

  it("falls back to REALEVENTS_MANAGE_TOKEN env var when no token in input", async () => {
    process.env.REALEVENTS_MANAGE_TOKEN = "env-token";
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/env-token" })
      .reply(200, {
        event: makeEvent(),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/env-token"
      });

    const result = await handleGetManageEvent({});

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("No registrations yet.");
  });

  it("returns isError with the missing-token message when neither input nor env is set", async () => {
    const result = await handleGetManageEvent({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });

  it("returns isError when the manage token is invalid", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/bad" })
      .reply(404, { error: "Invalid manage token" });

    const result = await handleGetManageEvent({ manage_token: "bad" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid manage token");
  });
});
