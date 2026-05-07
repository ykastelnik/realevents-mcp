import { describe, expect, it } from "vitest";
import { handleRegisterForEvent } from "../../src/tools/register.js";
import {
  makeEvent,
  makeRegistration,
  setupMockApi,
  TEST_API_HOST,
  textOf
} from "../helpers/mock-fetch.js";

describe("register_for_event tool", () => {
  const ctx = setupMockApi();

  it("wraps the body in { registration: ... } and confirms the registration", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/bordeaux-tech-meetup/registrations",
        body: JSON.stringify({
          registration: { email: "marie@example.com", first_name: "Marie", last_name: "Dupont" }
        })
      })
      .reply(201, {
        registration: makeRegistration(),
        event: makeEvent({ registrations_count: 1 })
      });

    const result = await handleRegisterForEvent({
      slug: "bordeaux-tech-meetup",
      email: "marie@example.com",
      first_name: "Marie",
      last_name: "Dupont"
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Marie Dupont");
    expect(text).toContain("marie@example.com");
    expect(text).toContain("Bordeaux Tech Meetup");
    expect(text).toContain("https://realevents.co/e/bordeaux-tech-meetup");
  });

  it("works with email only when names are not provided", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({ registration: { email: "x@y.com" } })
      })
      .reply(201, {
        registration: makeRegistration({ email: "x@y.com", first_name: null, last_name: null }),
        event: makeEvent({ slug: "test", title: "Test" })
      });

    const result = await handleRegisterForEvent({ slug: "test", email: "x@y.com" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("x@y.com");
  });

  it("includes the virtual_link if returned by the API", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/v/registrations" })
      .reply(201, {
        registration: makeRegistration(),
        event: makeEvent({ slug: "v", format: "virtual" }),
        virtual_link: "https://meet.example/secret"
      });

    const result = await handleRegisterForEvent({ slug: "v", email: "x@y.com" });

    expect(textOf(result)).toContain("https://meet.example/secret");
  });

  it("returns isError when the API rejects (e.g., already registered)", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/test/registrations" })
      .reply(422, { error: "Email already registered for this event" });

    const result = await handleRegisterForEvent({ slug: "test", email: "x@y.com" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("already registered");
  });
});
