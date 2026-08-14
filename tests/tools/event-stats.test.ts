import { describe, expect, it } from "vitest";
import { handleGetEventStats } from "../../src/tools/event-stats.js";
import {
  makeEvent,
  makeRegistration,
  setupMockApi,
  TEST_API_HOST,
  textOf
} from "../helpers/mock-fetch.js";

describe("get_event_stats tool", () => {
  const ctx = setupMockApi();

  it("reports the numbers behind 'how is my event doing'", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({
          page_views: 140,
          registrations_count: 12,
          maybe_registrations_count: 3,
          allow_maybe: true,
          max_attendees: 20,
          places_remaining: 8
        }),
        registrations: [
          makeRegistration({ id: 1, status: "confirmed" }),
          makeRegistration({ id: 2, status: "declined" })
        ],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("140");
    expect(text).toContain("12");
    expect(text).toContain("8");
    expect(text).toContain("3");
  });

  // Page views to confirmed RSVPs is the one derived number worth computing: it is
  // what tells an organizer whether the page or the promotion is the problem.
  it("derives a conversion rate from views to attendance", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ page_views: 100, registrations_count: 25 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });
    expect(textOf(result)).toContain("25%");
  });

  it("does not divide by zero when the page has no views yet", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ page_views: 0, registrations_count: 0 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).not.toContain("NaN");
    expect(textOf(result)).not.toContain("Infinity");
  });

  // The manage payload does NOT carry places_remaining (only the public one does),
  // so defaulting it to 0 reported "0 left" on an event with 9 free places - an
  // organizer could believe they were full and stop promoting. Derive it instead.
  it("derives remaining capacity when the manage payload omits places_remaining", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ max_attendees: 10, registrations_count: 1 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });
    expect(textOf(result)).toContain("9 left");
    expect(textOf(result)).not.toContain("0 left");
  });

  it("never reports negative capacity when the event is over-subscribed", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ max_attendees: 2, registrations_count: 5 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });
    expect(textOf(result)).toContain("0 left");
    expect(textOf(result)).not.toContain("-3");
  });

  it("prefers an explicit places_remaining when the payload provides one", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ max_attendees: 10, registrations_count: 1, places_remaining: 4 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleGetEventStats({ manage_token: "tok" });
    expect(textOf(result)).toContain("4 left");
  });

  // "Going" is a head-count (confirmed rows plus everyone they bring) while
  // page_views only counts non-crawler views of the PUBLIC page. A guest invited by
  // email who RSVPs from a direct link, or one guest bringing three others, produces
  // more attendees than views - so the ratio can legitimately exceed 100%. Printing
  // "300% of visitors are attending" reads as a broken statistic.
  it("does not present a conversion rate above 100%", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ page_views: 2, registrations_count: 6 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const text = textOf(await handleGetEventStats({ manage_token: "tok" }));
    expect(text).not.toMatch(/\b[1-9]\d{2,}%/);
  });

  it("still reports a normal conversion rate", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent({ page_views: 100, registrations_count: 25 }),
        registrations: [],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    expect(textOf(await handleGetEventStats({ manage_token: "tok" }))).toContain("25%");
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handleGetEventStats({});
    expect(result.isError).toBe(true);
  });
});
