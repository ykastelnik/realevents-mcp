import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/index.js";
import { registerCancelEvent } from "../../src/tools/cancel-event.js";
import { registerCreateEvent } from "../../src/tools/create-event.js";
import { registerDuplicateEvent } from "../../src/tools/duplicate-event.js";
import { registerGetEvent } from "../../src/tools/get-event.js";
import { registerGetEventStats } from "../../src/tools/event-stats.js";
import { registerGetManageEvent } from "../../src/tools/get-manage-event.js";
import { registerListPublicEvents } from "../../src/tools/list-events.js";
import { registerListRegistrations } from "../../src/tools/list-registrations.js";
import { registerForEvent } from "../../src/tools/register.js";
import { registerUpdateEvent } from "../../src/tools/update-event.js";

interface FakeServer {
  registerTool: ReturnType<typeof vi.fn>;
}

function makeFakeServer(): FakeServer {
  return { registerTool: vi.fn() };
}

describe("tool registration", () => {
  it("registers all ten tools with the expected names and inputSchema fields", () => {
    const server = makeFakeServer();
    const registrants = [
      {
        fn: registerCreateEvent,
        name: "create_event",
        required: ["title", "start_datetime", "timezone"]
      },
      { fn: registerGetEvent, name: "get_event", required: ["slug"] },
      { fn: registerGetManageEvent, name: "get_manage_event", required: [] },
      { fn: registerListPublicEvents, name: "list_public_events", required: [] },
      {
        fn: registerForEvent,
        name: "register_for_event",
        required: ["slug", "email", "first_name", "status", "plus_ones_count"]
      },
      { fn: registerUpdateEvent, name: "update_event", required: ["timezone", "allow_maybe"] },
      { fn: registerListRegistrations, name: "list_registrations", required: ["status"] },
      { fn: registerGetEventStats, name: "get_event_stats", required: [] },
      { fn: registerCancelEvent, name: "cancel_event", required: [] },
      { fn: registerDuplicateEvent, name: "duplicate_event", required: [] }
    ];

    for (const { fn, name, required } of registrants) {
      fn(server as never);
      const calls = server.registerTool.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const [toolName, config] = lastCall as [
        string,
        { description: string; inputSchema: Record<string, unknown> }
      ];
      expect(toolName).toBe(name);
      expect(typeof config.description).toBe("string");
      expect(config.description.length).toBeGreaterThan(20);
      for (const key of required) {
        expect(config.inputSchema[key]).toBeDefined();
      }
    }

    expect(server.registerTool).toHaveBeenCalledTimes(10);
  });

  it("create_event input schema does not include end_datetime", () => {
    const server = makeFakeServer();
    registerCreateEvent(server as never);
    const [, config] = server.registerTool.mock.calls[0] as [
      string,
      { inputSchema: Record<string, unknown> }
    ];
    expect(config.inputSchema["end_datetime"]).toBeUndefined();
  });

  // The registrants above are exercised individually, so a tool can be written and
  // tested yet never reach createServer - which is the only thing a real client
  // talks to. This asserts the wiring, not just the definitions.
  it("createServer exposes every tool to a real client", async () => {
    const server = createServer();
    // The SDK stores registered tools on the internal registry; reading it is the
    // only way to assert wiring without standing up a transport.
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    );

    expect(registered.sort()).toEqual(
      [
        "cancel_event",
        "create_event",
        "duplicate_event",
        "get_event",
        "get_event_stats",
        "get_manage_event",
        "list_public_events",
        "list_registrations",
        "register_for_event",
        "update_event"
      ].sort()
    );
  });
});
