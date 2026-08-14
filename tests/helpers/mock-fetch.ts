import { afterEach, beforeEach } from "vitest";
import type { ApiEvent, ApiRegistration } from "../../src/types.js";

export const TEST_API_BASE = "http://localhost:3000/api/v1";
export const TEST_API_HOST = "http://localhost:3000";

// Why this is hand-rolled instead of undici's MockAgent:
//
// Under Node 26, global `fetch` no longer routes through undici's global dispatcher,
// so `setGlobalDispatcher(new MockAgent())` stopped intercepting AND `disableNetConnect()`
// stopped blocking. Both failures were silent: every test in this repo was issuing real
// network calls, and only "passed" historically because nothing was listening on
// localhost:3000. Once a dev Rails was running there, 31 of 64 tests started failing with
// real HTTP 500s, and the create_event tests were POSTing real events to a real database.
//
// This stubs `globalThis.fetch` directly, which no dispatcher change can route around, and
// keeps the chained `.get(host).intercept({...}).reply(...)` shape so the test files did
// not need rewriting. Unmatched requests THROW rather than escaping to the network: that
// is the `disableNetConnect` guarantee, restored and pinned by mock-fetch.guard.test.ts.

type HeaderMatcher = (headers: Record<string, string>) => boolean;

interface InterceptOptions {
  method?: string;
  path: string;
  body?: string;
  headers?: Record<string, string> | HeaderMatcher;
}

interface Interceptor {
  origin: string;
  options: InterceptOptions;
  status: number;
  body: unknown;
  error?: Error;
  consumed: boolean;
}

interface ReplyHandle {
  reply(status: number, body?: unknown): void;
  replyWithError(error: Error): void;
}

interface OriginHandle {
  intercept(options: InterceptOptions): ReplyHandle;
}

export interface MockAgentLike {
  get(origin: string): OriginHandle;
}

export interface MockContext {
  agent: MockAgentLike;
}

interface NormalizedRequest {
  origin: string;
  pathWithQuery: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

function headersToObject(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function headersMatch(
  expected: InterceptOptions["headers"],
  actual: Record<string, string>
): boolean {
  if (!expected) return true;
  if (typeof expected === "function") return expected(actual);
  return Object.entries(expected).every(([key, value]) => actual[key.toLowerCase()] === value);
}

function matches(interceptor: Interceptor, request: NormalizedRequest): boolean {
  if (interceptor.consumed) return false;
  if (interceptor.origin !== request.origin) return false;
  if ((interceptor.options.method ?? "GET").toUpperCase() !== request.method) return false;
  if (interceptor.options.path !== request.pathWithQuery) return false;
  if (interceptor.options.body !== undefined && interceptor.options.body !== request.body) {
    return false;
  }
  return headersMatch(interceptor.options.headers, request.headers);
}

function makeAgent(interceptors: Interceptor[]): MockAgentLike {
  return {
    get(origin: string): OriginHandle {
      const normalizedOrigin = origin.replace(/\/$/, "");
      return {
        intercept(options: InterceptOptions): ReplyHandle {
          const entry: Interceptor = {
            origin: normalizedOrigin,
            options,
            status: 200,
            body: undefined,
            consumed: false
          };
          interceptors.push(entry);
          return {
            reply(status: number, body?: unknown): void {
              entry.status = status;
              entry.body = body;
            },
            replyWithError(error: Error): void {
              entry.error = error;
            }
          };
        }
      };
    }
  };
}

export function setupMockApi(): MockContext {
  let interceptors: Interceptor[] = [];
  const ctx: MockContext = { agent: makeAgent(interceptors) };

  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;
  let originalPublicEnv: string | undefined;
  let originalManageTokenEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.REALEVENTS_API_URL;
    originalPublicEnv = process.env.REALEVENTS_PUBLIC_URL;
    originalManageTokenEnv = process.env.REALEVENTS_MANAGE_TOKEN;
    process.env.REALEVENTS_API_URL = TEST_API_BASE;
    delete process.env.REALEVENTS_PUBLIC_URL;
    delete process.env.REALEVENTS_MANAGE_TOKEN;

    interceptors = [];
    ctx.agent = makeAgent(interceptors);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const request: NormalizedRequest = {
        origin: url.origin,
        pathWithQuery: `${url.pathname}${url.search}`,
        method: (init?.method ?? "GET").toUpperCase(),
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: headersToObject(init?.headers)
      };

      const interceptor = interceptors.find((candidate) => matches(candidate, request));

      if (!interceptor) {
        // Loud on purpose. A silent pass-through here is exactly the bug this
        // harness exists to prevent.
        throw new Error(
          `No mock interceptor matched ${request.method} ${url.toString()}. ` +
            "Register one with ctx.agent.get(origin).intercept({...}).reply(...)."
        );
      }

      interceptor.consumed = true;
      if (interceptor.error) throw interceptor.error;

      const payload =
        typeof interceptor.body === "string"
          ? interceptor.body
          : JSON.stringify(interceptor.body ?? null);

      return new Response(payload, {
        status: interceptor.status,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

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
