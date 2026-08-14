import { describe, expect, it } from "vitest";
import { handleCreateEvent } from "../../src/tools/create-event.js";
import { makeEvent, setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("create_event tool", () => {
  const ctx = setupMockApi();

  it("wraps the body in { event: ... } and returns the public + manage links", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events",
        body: JSON.stringify({
          event: {
            title: "Bordeaux Tech Meetup",
            start_datetime: "2026-06-15T19:00:00Z"
          }
        })
      })
      .reply(201, {
        event: makeEvent(),
        manage_url: "/manage/tok-abc",
        public_url: "/e/bordeaux-tech-meetup"
      });

    const result = await handleCreateEvent({
      title: "Bordeaux Tech Meetup",
      start_datetime: "2026-06-15T19:00:00Z"
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain('Event "Bordeaux Tech Meetup" created successfully');
    expect(text).toContain("https://realevents.co/e/bordeaux-tech-meetup");
    expect(text).toContain("https://realevents.co/manage/tok-abc");
    expect(text).toContain("update_event");
  });

  it("forwards optional fields when provided", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events",
        body: JSON.stringify({
          event: {
            title: "Demo",
            start_datetime: "2026-06-15T19:00:00Z",
            format: "virtual",
            description: "About",
            location: "Paris",
            virtual_link: "https://meet.example/x",
            max_attendees: 50,
            organizer_email: "org@example.com"
          }
        })
      })
      .reply(201, {
        event: makeEvent({ title: "Demo", format: "virtual" }),
        manage_url: "/manage/tok",
        public_url: "/e/demo"
      });

    const result = await handleCreateEvent({
      title: "Demo",
      start_datetime: "2026-06-15T19:00:00Z",
      format: "virtual",
      description: "About",
      location: "Paris",
      virtual_link: "https://meet.example/x",
      max_attendees: 50,
      organizer_email: "org@example.com"
    });

    expect(result.isError).toBeFalsy();
  });

  it("never sends end_datetime even if a future caller passes it", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events",
        body: JSON.stringify({
          event: {
            title: "Demo",
            start_datetime: "2026-06-15T19:00:00Z"
          }
        })
      })
      .reply(201, {
        event: makeEvent({ title: "Demo" }),
        manage_url: "/manage/tok",
        public_url: "/e/demo"
      });

    const result = await handleCreateEvent({
      title: "Demo",
      start_datetime: "2026-06-15T19:00:00Z",
      // end_datetime is intentionally not in the schema; pass it as an unknown extra
      end_datetime: "2026-06-15T22:00:00Z"
    } as never);

    expect(result.isError).toBeFalsy();
  });

  // The API parses start_datetime *in the event's timezone* and defaults that
  // timezone to UTC. Omitting it silently shifted every MCP-created event by the
  // organizer's UTC offset - a Paris "19:00" became 21:00 local, with no error.
  it("forwards timezone so the API does not silently default the event to UTC", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "POST",
        path: "/api/v1/events",
        body: JSON.stringify({
          event: {
            title: "Paris Meetup",
            start_datetime: "2026-06-15T19:00:00",
            timezone: "Europe/Paris"
          }
        })
      })
      .reply(201, {
        event: makeEvent({ title: "Paris Meetup", timezone: "Europe/Paris" }),
        manage_url: "/manage/tok",
        public_url: "/e/paris-meetup"
      });

    const result = await handleCreateEvent({
      title: "Paris Meetup",
      start_datetime: "2026-06-15T19:00:00",
      timezone: "Europe/Paris"
    });

    expect(result.isError).toBeFalsy();
  });

  // The confirmation must read the start time on the EVENT's clock. Formatting it
  // in the host's zone produced output that contradicted the Timezone line printed
  // directly beneath it - a 19:00 New York event confirmed as "1:00 AM GMT+2".
  it("echoes the start time in the event's timezone, not the host's", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(201, {
        // 23:00 UTC is 19:00 in New York; the host clock must not decide this.
        event: makeEvent({
          start_datetime: "2026-10-01T23:00:00Z",
          timezone: "America/New_York"
        }),
        manage_url: "/manage/tok",
        public_url: "/e/x"
      });

    const text = textOf(
      await handleCreateEvent({
        title: "NY",
        start_datetime: "2026-10-01T19:00:00",
        timezone: "America/New_York"
      })
    );

    expect(text).toContain("7:00 PM");
    expect(text).toMatch(/Starts:.*October 1/);
  });

  it("surfaces the stored timezone back to the caller", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(201, {
        event: makeEvent({ title: "Paris Meetup", timezone: "Europe/Paris" }),
        manage_url: "/manage/tok",
        public_url: "/e/paris-meetup"
      });

    const result = await handleCreateEvent({
      title: "Paris Meetup",
      start_datetime: "2026-06-15T19:00:00",
      timezone: "Europe/Paris"
    });

    expect(textOf(result)).toContain("Europe/Paris");
  });

  it("returns isError on validation failure", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(422, { error: "Title can't be blank" });

    const result = await handleCreateEvent({
      title: "",
      start_datetime: "2026-06-15T19:00:00Z"
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Title can't be blank");
  });
});
