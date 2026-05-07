import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from "undici";
import { afterEach, beforeEach } from "vitest";
import type { ApiEvent, ApiRegistration } from "../../src/types.js";

export const TEST_API_BASE = "http://localhost:3000/api/v1";
export const TEST_API_HOST = "http://localhost:3000";

export interface MockContext {
  agent: MockAgent;
}

export function setupMockApi(): MockContext {
  const ctx: MockContext = { agent: new MockAgent() };
  let originalDispatcher: Dispatcher | null = null;
  let originalEnv: string | undefined;
  let originalPublicEnv: string | undefined;
  let originalManageTokenEnv: string | undefined;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    originalEnv = process.env.REALEVENTS_API_URL;
    originalPublicEnv = process.env.REALEVENTS_PUBLIC_URL;
    originalManageTokenEnv = process.env.REALEVENTS_MANAGE_TOKEN;
    process.env.REALEVENTS_API_URL = TEST_API_BASE;
    delete process.env.REALEVENTS_PUBLIC_URL;
    delete process.env.REALEVENTS_MANAGE_TOKEN;

    ctx.agent = new MockAgent();
    ctx.agent.disableNetConnect();
    setGlobalDispatcher(ctx.agent);
  });

  afterEach(async () => {
    await ctx.agent.close();
    if (originalDispatcher) setGlobalDispatcher(originalDispatcher);

    if (originalEnv === undefined) delete process.env.REALEVENTS_API_URL;
    else process.env.REALEVENTS_API_URL = originalEnv;

    if (originalPublicEnv === undefined) delete process.env.REALEVENTS_PUBLIC_URL;
    else process.env.REALEVENTS_PUBLIC_URL = originalPublicEnv;

    if (originalManageTokenEnv === undefined) delete process.env.REALEVENTS_MANAGE_TOKEN;
    else process.env.REALEVENTS_MANAGE_TOKEN = originalManageTokenEnv;
  });

  return ctx;
}

export function makeEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: 1,
    title: "Bordeaux Tech Meetup",
    slug: "bordeaux-tech-meetup",
    format: "in_person",
    status: "published",
    start_datetime: "2026-06-15T19:00:00Z",
    end_datetime: null,
    description: null,
    location: null,
    virtual_link: null,
    max_attendees: null,
    registrations_count: 0,
    ...overrides
  };
}

export function makeRegistration(overrides: Partial<ApiRegistration> = {}): ApiRegistration {
  return {
    id: 1,
    email: "marie@example.com",
    first_name: "Marie",
    last_name: "Dupont",
    status: "confirmed",
    created_at: "2026-03-15T10:00:00Z",
    ...overrides
  };
}

type ToolHandlerResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

export function textOf(result: ToolHandlerResult): string {
  return result.content.map((c) => c.text).join("\n");
}
