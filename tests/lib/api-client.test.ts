import { describe, expect, it } from "vitest";
import { apiCall, ApiError } from "../../src/lib/api-client.js";
import { setupMockApi } from "../helpers/mock-fetch.js";

describe("apiCall", () => {
  // Shares the fetch-stubbing harness with the tool tests. See mock-fetch.ts for
  // why undici's MockAgent is no longer usable here.
  const ctx = setupMockApi();
  const agent = { get: (origin: string) => ctx.agent.get(origin) };

  it("returns parsed JSON on 200", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/events/test" })
      .reply(200, { event: { slug: "test", title: "Test" } });

    const result = await apiCall("GET", "/events/test");

    expect(result).toEqual({ event: { slug: "test", title: "Test" } });
  });

  it("uses BASE_URL from REALEVENTS_API_URL env", async () => {
    process.env.REALEVENTS_API_URL = "http://example.com/api/v2";
    agent
      .get("http://example.com")
      .intercept({ method: "GET", path: "/api/v2/ping" })
      .reply(200, { ok: true });

    const result = await apiCall("GET", "/ping");
    expect(result).toEqual({ ok: true });
  });

  it("falls back to https://realevents.co/api/v1 when env unset", async () => {
    delete process.env.REALEVENTS_API_URL;
    agent
      .get("https://realevents.co")
      .intercept({ method: "GET", path: "/api/v1/ping" })
      .reply(200, { ok: true });

    const result = await apiCall("GET", "/ping");
    expect(result).toEqual({ ok: true });
  });

  it("sends JSON body with Content-Type header on POST", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({
        method: "POST",
        path: "/api/v1/events",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Hello" })
      })
      .reply(201, { event: { slug: "hello" } });

    const result = await apiCall("POST", "/events", { body: { title: "Hello" } });
    expect(result).toEqual({ event: { slug: "hello" } });
  });

  it("builds query string from params and maps search to q for /directory", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/directory?q=tech&format=virtual&page=2" })
      .reply(200, { events: [], meta: { page: 2, per_page: 12, total: 0, total_pages: 0 } });

    const result = await apiCall("GET", "/directory", {
      query: { search: "tech", format: "virtual", page: 2 }
    });
    expect(result).toEqual({
      events: [],
      meta: { page: 2, per_page: 12, total: 0, total_pages: 0 }
    });
  });

  it("omits undefined and empty query params", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/directory?format=in_person" })
      .reply(200, { events: [], meta: { page: 1, per_page: 12, total: 0, total_pages: 0 } });

    await apiCall("GET", "/directory", {
      query: { format: "in_person", search: undefined, date: "" }
    });
  });

  it("throws ApiError with API error message on 4xx", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(422, { error: "Title can't be blank" });

    await expect(apiCall("POST", "/events", { body: {} })).rejects.toThrow("Title can't be blank");
    await expect(apiCall("POST", "/events", { body: {} })).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with status text when 4xx body has no error field", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/events/missing" })
      .reply(404, { something: "else" });

    await expect(apiCall("GET", "/events/missing")).rejects.toThrow(/API error: 404/);
  });

  it("throws on 5xx with generic message", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/events/boom" })
      .reply(500, "Internal Server Error");

    await expect(apiCall("GET", "/events/boom")).rejects.toThrow(/API error: 500/);
  });

  // Rails' render_validation_errors returns a generic error ("Validation failed")
  // with the actionable detail in a separate `errors` array. Reading only `error`
  // meant every model validation failure - a too-long comment, a bad email, a
  // missing name - reported "Validation failed" with no hint of what to fix.
  it("prefers the field-level errors array over the generic error string", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "POST", path: "/api/v1/manage/tok/comments" })
      .reply(422, {
        error: "Validation failed",
        errors: ["Body is too long (maximum is 500 characters)"]
      });

    await expect(apiCall("POST", "/manage/tok/comments", { body: {} })).rejects.toThrow(
      /maximum is 500 characters/
    );
  });

  it("joins multiple field errors into one message", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(422, {
        error: "Validation failed",
        errors: ["Title can't be blank", "Start datetime can't be blank"]
      });

    await expect(apiCall("POST", "/events", { body: {} })).rejects.toThrow(
      /Title can't be blank.*Start datetime can't be blank/
    );
  });

  it("still uses the error string when no errors array is present", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(422, { error: "This event is full" });

    await expect(apiCall("POST", "/events", { body: {} })).rejects.toThrow("This event is full");
  });

  it("ignores an empty errors array rather than throwing a blank message", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "POST", path: "/api/v1/events" })
      .reply(422, { error: "Validation failed", errors: [] });

    await expect(apiCall("POST", "/events", { body: {} })).rejects.toThrow("Validation failed");
  });

  it("wraps network errors with a clear message", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({ method: "GET", path: "/api/v1/network-fail" })
      .replyWithError(new Error("ECONNREFUSED"));

    await expect(apiCall("GET", "/network-fail")).rejects.toThrow(/Network error/);
  });

  it("sends X-RealEvents-Client header identifying the MCP client and version", async () => {
    agent
      .get("http://localhost:3000")
      .intercept({
        method: "GET",
        path: "/api/v1/ping",
        headers: (headers: Record<string, string>) =>
          /^realevents-mcp\/\d+\.\d+\.\d+$/.test(headers["x-realevents-client"] ?? "")
      })
      .reply(200, { ok: true });

    const result = await apiCall("GET", "/ping");
    expect(result).toEqual({ ok: true });
  });
});
