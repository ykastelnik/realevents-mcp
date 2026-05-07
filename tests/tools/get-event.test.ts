import { describe, expect, it } from "vitest";
import { handleGetEvent } from "../../src/tools/get-event.js";
import { makeEvent, setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("get_event tool", () => {
  const ctx = setupMockApi();

  it("returns the formatted event text on success", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/events/bordeaux-tech-meetup" })
      .reply(200, {
        event: makeEvent({ location: "Bordeaux", registrations_count: 12 })
      });

    const result = await handleGetEvent({ slug: "bordeaux-tech-meetup" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Bordeaux Tech Meetup");
    expect(text).toContain("Location: Bordeaux");
    expect(text).toContain("Registrations: 12 people");
  });

  it("returns isError on 404", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/events/missing" })
      .reply(404, { error: "Event not found" });

    const result = await handleGetEvent({ slug: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Event not found");
  });

  it("returns isError on network failure", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/events/boom" })
      .replyWithError(new Error("ECONNREFUSED"));

    const result = await handleGetEvent({ slug: "boom" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Network error/);
  });
});
