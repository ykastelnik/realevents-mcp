import { describe, expect, it, vi } from "vitest";
import { registerCreateEvent } from "../../src/tools/create-event.js";
import { registerGetEvent } from "../../src/tools/get-event.js";
import { registerGetManageEvent } from "../../src/tools/get-manage-event.js";
import { registerListPublicEvents } from "../../src/tools/list-events.js";
import { registerForEvent } from "../../src/tools/register.js";
import { registerUpdateEvent } from "../../src/tools/update-event.js";

interface FakeServer {
  registerTool: ReturnType<typeof vi.fn>;
}

function makeFakeServer(): FakeServer {
  return { registerTool: vi.fn() };
}

describe("tool registration", () => {
  it("registers all six tools with the expected names and inputSchema fields", () => {
    const server = makeFakeServer();
    const registrants = [
      { fn: registerCreateEvent, name: "create_event", required: ["title", "start_datetime"] },
      { fn: registerGetEvent, name: "get_event", required: ["slug"] },
      { fn: registerGetManageEvent, name: "get_manage_event", required: [] },
      { fn: registerListPublicEvents, name: "list_public_events", required: [] },
      { fn: registerForEvent, name: "register_for_event", required: ["slug", "email"] },
      { fn: registerUpdateEvent, name: "update_event", required: [] }
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

    expect(server.registerTool).toHaveBeenCalledTimes(6);
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
});
