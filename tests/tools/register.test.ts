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

  // The API requires first_name on any non-invitation RSVP
  // (`validates :first_name, presence: true, if: status.in?(RESPONSE_STATUSES) && invited_at.nil?`).
  // An MCP registration is never an invitation, so an email-only call always 422s.
  // The previous test asserted the opposite and only passed because it was mocked.
  it("surfaces the API's rejection when first_name is missing", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/test/registrations" })
      .reply(422, { error: "First name can't be blank" });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: ""
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("First name");
  });

  it("sends a maybe response when the guest is undecided", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: { email: "x@y.com", first_name: "Ana", status: "maybe" }
        })
      })
      .reply(201, {
        registration: makeRegistration({ email: "x@y.com", first_name: "Ana", status: "maybe" }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "maybe"
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("maybe");
  });

  it("sends a declined response so an assistant can record a no", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: { email: "x@y.com", first_name: "Ana", status: "declined" }
        })
      })
      .reply(201, {
        registration: makeRegistration({ status: "declined" }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "declined"
    });

    expect(result.isError).toBeFalsy();
  });

  it("forwards plus-ones with their names", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: {
            email: "x@y.com",
            first_name: "Ana",
            status: "confirmed",
            plus_ones_count: 2,
            plus_one_names: ["Luc", "Zoe"]
          }
        })
      })
      // The PUBLIC register endpoint's registration_json is exactly
      // {id, email, first_name, last_name, status, response_note} (+ the token).
      // It does NOT echo plus-ones - only the manage payload does. Mocking them
      // here made the "+2" assertion pass against a payload the API never sends,
      // so the tool's own confirmation silently dropped every booked party.
      .reply(201, {
        registration: makeRegistration({ first_name: "Ana", response_note: null }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "confirmed",
      plus_ones_count: 2,
      plus_one_names: ["Luc", "Zoe"]
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    // Echoed from what was accepted, since the response cannot tell us.
    expect(text).toContain("+2");
    expect(text).toContain("Luc");
    expect(text).toContain("Zoe");
  });

  it("reports the party size even when the organizer collects no names", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/test/registrations" })
      .reply(201, {
        registration: makeRegistration({ first_name: "Ana" }),
        event: makeEvent({ slug: "test" })
      });

    const text = textOf(
      await handleRegisterForEvent({
        slug: "test",
        email: "x@y.com",
        first_name: "Ana",
        status: "confirmed",
        plus_ones_count: 3
      })
    );

    expect(text).toContain("+3");
  });

  it("does not claim a party on a maybe response, where plus-ones are not sent", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/test/registrations" })
      .reply(201, {
        registration: makeRegistration({ first_name: "Ana", status: "maybe" }),
        event: makeEvent({ slug: "test" })
      });

    const text = textOf(
      await handleRegisterForEvent({
        slug: "test",
        email: "x@y.com",
        first_name: "Ana",
        status: "maybe",
        plus_ones_count: 2
      })
    );

    // Match the Bringing line specifically: a bare "+2" also appears in the
    // timezone offset ("GMT+2"), which would make this assertion fail for a
    // reason that has nothing to do with plus-ones.
    expect(text).not.toMatch(/Bringing:/);
  });

  // The API rejects a positive plus-ones count on any non-confirmed status. Sending
  // them anyway turns "they might come, and would bring a friend" into a hard 422,
  // so the tool drops them rather than letting the whole RSVP fail.
  it("omits plus-ones on a maybe response instead of triggering a 422", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: { email: "x@y.com", first_name: "Ana", status: "maybe" }
        })
      })
      .reply(201, {
        registration: makeRegistration({ status: "maybe" }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "maybe",
      plus_ones_count: 2,
      plus_one_names: ["Luc", "Zoe"]
    });

    expect(result.isError).toBeFalsy();
  });

  it("omits plus-ones on a declined response", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: { email: "x@y.com", first_name: "Ana", status: "declined" }
        })
      })
      .reply(201, {
        registration: makeRegistration({ status: "declined" }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "declined",
      plus_ones_count: 3
    });

    expect(result.isError).toBeFalsy();
  });

  it("forwards the guest's note", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events/test/registrations",
        body: JSON.stringify({
          registration: { email: "x@y.com", first_name: "Ana", response_note: "Vegetarian" }
        })
      })
      .reply(201, {
        registration: makeRegistration({ response_note: "Vegetarian" }),
        event: makeEvent({ slug: "test" })
      });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      response_note: "Vegetarian"
    });

    expect(result.isError).toBeFalsy();
  });

  // Capacity is a head-count, so a +N can be refused on an event that still has
  // free rows. The 422 carries places_remaining; surfacing it lets the assistant
  // retry with a smaller party instead of reporting a dead end.
  it("surfaces places_remaining so a refused party can be resized", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events/test/registrations" })
      .reply(422, { error: "Only 2 places left", field: "plus_ones", places_remaining: 2 });

    const result = await handleRegisterForEvent({
      slug: "test",
      email: "x@y.com",
      first_name: "Ana",
      status: "confirmed",
      plus_ones_count: 5
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Only 2 places left");
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
