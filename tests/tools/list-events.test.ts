import { describe, expect, it } from "vitest";
import { handleListPublicEvents } from "../../src/tools/list-events.js";
import { setupMockApi, TEST_API_HOST, textOf } from "../helpers/mock-fetch.js";

describe("list_public_events tool", () => {
  const ctx = setupMockApi();

  it("maps the search input to the q query parameter", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/directory?q=tech" })
      .reply(200, {
        events: [
          {
            id: 1,
            title: "Tech Meetup",
            slug: "tech-meetup",
            format: "in_person",
            start_datetime: "2026-06-15T19:00:00Z",
            location: "Bordeaux"
          }
        ],
        meta: { page: 1, per_page: 12, total: 1, total_pages: 1 }
      });

    const result = await handleListPublicEvents({ search: "tech" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Tech Meetup");
    expect(textOf(result)).toContain("https://realevents.co/e/tech-meetup");
  });

  it("forwards format, date, page, per_page parameters", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({
        method: "GET",
        path: "/api/v1/directory?format=virtual&date=this_week&page=2&per_page=5"
      })
      .reply(200, {
        events: [],
        meta: { page: 2, per_page: 5, total: 0, total_pages: 0 }
      });

    const result = await handleListPublicEvents({
      format: "virtual",
      date: "this_week",
      page: 2,
      per_page: 5
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("No events found");
  });

  it("renders pagination hint when more pages exist", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/directory" })
      .reply(200, {
        events: [
          {
            id: 1,
            title: "First",
            slug: "first",
            format: "in_person",
            start_datetime: "2026-06-15T19:00:00Z",
            location: null
          }
        ],
        meta: { page: 1, per_page: 1, total: 3, total_pages: 3 }
      });

    const result = await handleListPublicEvents({});
    expect(textOf(result)).toMatch(/Use page: 2 to see more/);
  });

  it("returns isError when the API fails", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/directory" })
      .reply(500, "boom");

    const result = await handleListPublicEvents({});
    expect(result.isError).toBe(true);
  });
});
