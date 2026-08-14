import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://realevents.co/api/v1";

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // ignore, fall through
  }
  return "0.0.0";
}

const CLIENT_HEADER = `realevents-mcp/${readPackageVersion()}`;

export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    if (status !== undefined) {
      this.status = status;
    }
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface ApiCallOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
}

function getBaseUrl(): string {
  const env = process.env.REALEVENTS_API_URL?.trim();
  return env && env.length > 0 ? env.replace(/\/$/, "") : DEFAULT_BASE_URL;
}

function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";

  const pairs: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) continue;
    const stringValue = String(rawValue);
    if (stringValue.length === 0) continue;
    const key = rawKey === "search" ? "q" : rawKey;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(stringValue)}`);
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

async function parseErrorMessage(response: Response, status: number): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown; errors?: unknown };

    // Rails' render_validation_errors returns a generic `error` ("Validation
    // failed") plus the actionable detail in `errors`. Reading only `error` meant
    // every model validation failure reported "Validation failed" with no hint of
    // what to fix, so prefer the field-level messages when they are present.
    if (Array.isArray(data?.errors)) {
      const details = data.errors.filter((e): e is string => typeof e === "string" && e.length > 0);
      if (details.length > 0) return details.join("; ");
    }

    if (data && typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
  } catch {
    // body wasn't JSON, fall through
  }
  return `API error: ${status}`;
}

export async function apiCall<T = unknown>(
  method: string,
  path: string,
  options: ApiCallOptions = {}
): Promise<T> {
  const url = `${getBaseUrl()}${path}${buildQueryString(options.query)}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-RealEvents-Client": CLIENT_HEADER
    }
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new ApiError(`Network error: ${cause}`);
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response, response.status);
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}
