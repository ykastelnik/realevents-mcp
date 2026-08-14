import { afterAll, describe, expect, it } from "vitest";
import { apiCall } from "../../src/lib/api-client.js";
import { setupMockApi, TEST_API_HOST } from "./mock-fetch.js";

// The harness itself is load-bearing: under Node 26 the previous undici MockAgent
// silently stopped intercepting AND stopped blocking, so every test in this repo
// was making real network calls to whatever happened to listen on localhost:3000.
// These tests pin the two guarantees the harness must provide, so a future runtime
// change fails here loudly instead of turning the whole suite into a no-op.
// Captured at module load, before setupMockApi's beforeEach ever runs, so it is
// genuinely the runtime's own fetch and not a stub from an earlier test.
const realFetchAtModuleLoad = globalThis.fetch;

describe("mock-fetch harness", () => {
  const realFetchBeforeSuite = realFetchAtModuleLoad;
  const ctx = setupMockApi();

  it("throws on a request that no interceptor matched, instead of hitting the network", async () => {
    await expect(apiCall("GET", "/events/never-registered")).rejects.toThrow(
      /No mock interceptor matched/
    );
  });

  it("throws when the path matches but the method does not", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/events/x" })
      .reply(200, {});

    await expect(apiCall("POST", "/events/x", { body: {} })).rejects.toThrow(
      /No mock interceptor matched/
    );
  });

  it("consumes each interceptor once, so a second identical call is not silently served", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/events/once" })
      .reply(200, { event: { slug: "once" } });

    await expect(apiCall("GET", "/events/once")).resolves.toEqual({ event: { slug: "once" } });
    await expect(apiCall("GET", "/events/once")).rejects.toThrow(/No mock interceptor matched/);
  });

  it("installs a stub for the duration of a test", () => {
    expect(globalThis.fetch).not.toBe(realFetchBeforeSuite);
  });
});

// Registered OUTSIDE the describe, so it runs after setupMockApi's afterEach has
// had its final chance to restore. Asserting restoration from inside a test cannot
// work: the stub is installed for the whole test body, so such an assertion passes
// whether or not afterEach ever puts the real fetch back. A leaked stub would let a
// later test file run against a stale interceptor set with nothing catching it -
// the same silent-harness class of failure this file exists to prevent.
afterAll(() => {
  expect(globalThis.fetch).toBe(realFetchAtModuleLoad);
});
