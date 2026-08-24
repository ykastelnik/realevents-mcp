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

  it("sends attendee_goal (a target, distinct from max_attendees) through to the manage API", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok-abc",
        body: JSON.stringify({ event: { attendee_goal: 150 } })
      })
      .reply(200, {
        event: makeEvent({ attendee_goal: 150 }),
        public_url: "/e/x",
        manage_url: "/manage/tok-abc"
      });

    const result = await handleUpdateEvent({
      manage_token: "tok-abc",
      attendee_goal: 150
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Updated fields: attendee_goal");
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

  it("sends the guest-facing settings the manage API accepts", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({
          event: {
            timezone: "Europe/Paris",
            allow_maybe: true,
            allow_notes: false,
            plus_ones_limit: 2,
            plus_ones_detail: "names"
          }
        })
      })
      .reply(200, {
        event: makeEvent({ timezone: "Europe/Paris" }),
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleUpdateEvent({
      manage_token: "tok",
      timezone: "Europe/Paris",
      allow_maybe: true,
      allow_notes: false,
      plus_ones_limit: 2,
      plus_ones_detail: "names"
    });

    expect(result.isError).toBeFalsy();
  });

  // Guest list visibility is writable because the API permits both columns and an
  // organizer asking an assistant to "show first names to everyone" should not
  // have to open the settings page. Both keys travel together in one PATCH:
  // sending only one leaves the other at its stored value, which is exactly how
  // an organizer ends up publishing nothing (or, worse, publishing under a format
  // they did not choose).
  it("sends both guest list settings together", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({
          event: { guest_list_display_mode: "first_names", guest_list_audience: "everyone" }
        })
      })
      .reply(200, {
        event: makeEvent({ guest_list_display_mode: "first_names", guest_list_audience: "everyone" }),
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleUpdateEvent({
      manage_token: "tok",
      guest_list_display_mode: "first_names",
      guest_list_audience: "everyone"
    });

    expect(result.isError).toBeFalsy();
  });

  // "responded" is RESERVED on the API and rejected there with a 422. The tool
  // must not advertise it as an option: an assistant that reads it, sends it, and
  // relays the failure has wasted the organizer's time on a setting the product
  // never had. The type union is the guard; this pins the API's own refusal so
  // the two cannot drift apart silently.
  it("surfaces the API refusal if the reserved responded audience is forced through", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({ event: { guest_list_audience: "responded" } })
      })
      .reply(422, { error: "Validation failed", errors: ["Guest list audience is not included in the list"] });

    const result = await handleUpdateEvent({
      manage_token: "tok",
      guest_list_audience: "responded" as never
    });

    expect(result.isError).toBe(true);
  });

  // `false` and `0` are meaningful values here: dropping them (as a plain falsy
  // filter does) would make it impossible to turn a setting off or disable plus-ones.
  it("sends falsy-but-meaningful values instead of dropping them", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        // Key order follows UPDATABLE_KEYS, not the order they were passed in.
        body: JSON.stringify({ event: { allow_comments: false, plus_ones_limit: 0 } })
      })
      .reply(200, { event: makeEvent(), public_url: "/e/x", manage_url: "/manage/tok" });

    const result = await handleUpdateEvent({
      manage_token: "tok",
      plus_ones_limit: 0,
      allow_comments: false
    });

    expect(result.isError).toBeFalsy();
  });

  // The API clears the column on a blank end_datetime, but the tool's own
  // empty-string filter ate the blank, so an end time could be set and never removed.
  it("clears the end time when asked, via an explicit flag", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({ event: { end_datetime: "" } })
      })
      .reply(200, { event: makeEvent(), public_url: "/e/x", manage_url: "/manage/tok" });

    const result = await handleUpdateEvent({ manage_token: "tok", clear_end_datetime: true });

    expect(result.isError).toBeFalsy();
  });

  it("ignores the clear flag when an end time is also supplied", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "PATCH",
        path: "/api/v1/manage/tok",
        body: JSON.stringify({ event: { end_datetime: "2026-06-15T22:00:00" } })
      })
      .reply(200, { event: makeEvent(), public_url: "/e/x", manage_url: "/manage/tok" });

    const result = await handleUpdateEvent({
      manage_token: "tok",
      end_datetime: "2026-06-15T22:00:00",
      clear_end_datetime: true
    });

    expect(result.isError).toBeFalsy();
  });
});
