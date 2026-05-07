import { describe, expect, it } from "vitest";
import { handleCreateEvent } from "../../src/tools/create-event.js";
import {
  makeEvent,
  setupMockApi,
  TEST_API_HOST,
  textOf
} from "../helpers/mock-fetch.js";

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
