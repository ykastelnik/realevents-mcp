import { describe, expect, it } from "vitest";
import { handleListRegistrations } from "../../src/tools/list-registrations.js";
import {
  makeEvent,
  makeRegistration,
  setupMockApi,
  TEST_API_HOST,
  textOf
} from "../helpers/mock-fetch.js";

const GUESTS = [
  makeRegistration({ id: 1, email: "ana@x.co", first_name: "Ana", status: "confirmed" }),
  makeRegistration({ id: 2, email: "sam@x.co", first_name: "Sam", status: "maybe" }),
  makeRegistration({ id: 3, email: "kim@x.co", first_name: "Kim", status: "declined" })
];

function replyWithGuests(ctx: ReturnType<typeof setupMockApi>) {
  ctx.agent
    .get(TEST_API_HOST)
    .intercept({ method: "GET", path: "/api/v1/manage/tok" })
    .reply(200, {
      event: makeEvent({ registrations_count: 1 }),
      registrations: GUESTS,
      public_url: "/e/x",
      manage_url: "/manage/tok"
    });
}

describe("list_registrations tool", () => {
  const ctx = setupMockApi();

  it("lists every guest when no status filter is given", async () => {
    replyWithGuests(ctx);

    const result = await handleListRegistrations({ manage_token: "tok" });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("Ana");
    expect(text).toContain("Sam");
    expect(text).toContain("Kim");
  });

  // "Who declined?" is the actual question organizers ask; get_manage_event answers
  // it only by making the caller read a wall of text.
  it("filters to a single status", async () => {
    replyWithGuests(ctx);

    const result = await handleListRegistrations({ manage_token: "tok", status: "declined" });

    const text = textOf(result);
    expect(text).toContain("Kim");
    expect(text).not.toContain("Ana");
    expect(text).not.toContain("Sam");
  });

  it("says so plainly when a filter matches nobody", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/tok" })
      .reply(200, {
        event: makeEvent(),
        registrations: [GUESTS[0]],
        public_url: "/e/x",
        manage_url: "/manage/tok"
      });

    const result = await handleListRegistrations({ manage_token: "tok", status: "declined" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/no .*declined/i);
  });

  it("returns isError when the manage token is missing", async () => {
    const result = await handleListRegistrations({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("REALEVENTS_MANAGE_TOKEN");
  });

  it("surfaces an API failure", async () => {
    ctx.agent
      .get(TEST_API_HOST)
      .intercept({ method: "GET", path: "/api/v1/manage/bad" })
      .reply(404, { error: "Invalid manage token" });

    const result = await handleListRegistrations({ manage_token: "bad" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid manage token");
  });
});
