import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ManageTokenMissingError,
  resolveManageToken
} from "../../src/lib/manage-token.js";

const ENV_KEY = "REALEVENTS_MANAGE_TOKEN";

describe("resolveManageToken", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it("returns the explicit input when provided", () => {
    expect(resolveManageToken("abc123")).toBe("abc123");
  });

  it("trims whitespace from explicit input", () => {
    expect(resolveManageToken("  abc123  ")).toBe("abc123");
  });

  it("falls back to the env var when input is absent", () => {
    process.env[ENV_KEY] = "env-token";
    expect(resolveManageToken()).toBe("env-token");
  });

  it("trims whitespace from env value", () => {
    process.env[ENV_KEY] = "  env-token  ";
    expect(resolveManageToken()).toBe("env-token");
  });

  it("prefers explicit input over env when both present", () => {
    process.env[ENV_KEY] = "env-token";
    expect(resolveManageToken("explicit")).toBe("explicit");
  });

  it("treats whitespace-only input as absent and falls back to env", () => {
    process.env[ENV_KEY] = "env-token";
    expect(resolveManageToken("   ")).toBe("env-token");
  });

  it("treats whitespace-only env as absent and throws if no input", () => {
    process.env[ENV_KEY] = "   ";
    expect(() => resolveManageToken()).toThrow(ManageTokenMissingError);
  });

  it("throws ManageTokenMissingError with the user-facing message when both are absent", () => {
    expect(() => resolveManageToken()).toThrow(
      "Provide manage_token or set REALEVENTS_MANAGE_TOKEN in your MCP server config."
    );
  });

  it("throws when input is empty string and env is unset", () => {
    expect(() => resolveManageToken("")).toThrow(ManageTokenMissingError);
  });
});
