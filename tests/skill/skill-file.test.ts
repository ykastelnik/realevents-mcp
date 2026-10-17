import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "../../src/index.js";

const SKILL_PATH = new URL("../../skills/realevents/SKILL.md", import.meta.url);

function readSkill(): { frontmatter: Record<string, string>; body: string } {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path to the repo's own skill file
  const raw = readFileSync(SKILL_PATH, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md has no frontmatter block");
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep > 0) frontmatter[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return { frontmatter, body: match[2] };
}

interface ZodLike {
  options?: readonly string[];
  unwrap?: () => ZodLike;
}

function enumValues(schema: ZodLike): readonly string[] {
  let current: ZodLike | undefined = schema;
  while (current?.unwrap && !current.options) current = current.unwrap();
  return current?.options ?? [];
}

// Every name the server really exposes: tools, their arguments, and enum values.
function exposedNames(): Set<string> {
  const spy = vi.spyOn(McpServer.prototype, "registerTool");
  createServer();
  const names = new Set<string>();
  for (const [toolName, config] of spy.mock.calls as [
    string,
    { inputSchema?: Record<string, ZodLike> }
  ][]) {
    names.add(toolName);
    for (const [key, schema] of Object.entries(config.inputSchema ?? {})) {
      names.add(key);
      for (const value of enumValues(schema)) names.add(value);
    }
  }
  spy.mockRestore();
  return names;
}

describe("skills/realevents/SKILL.md", () => {
  it("has a frontmatter name matching its folder and a usable description", () => {
    const { frontmatter } = readSkill();
    expect(frontmatter.name).toBe("realevents");
    expect(frontmatter.description.length).toBeGreaterThan(50);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
  });

  it("only names tools, arguments and values the server actually exposes", () => {
    const { body } = readSkill();
    const exposed = exposedNames();
    const cited = [...body.matchAll(/`([a-z][a-z_]*_[a-z]+)`/g)].map((m) => m[1]);
    expect(cited.length).toBeGreaterThan(5);
    expect(cited.filter((name) => !exposed.has(name))).toEqual([]);
  });
});
