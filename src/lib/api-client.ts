const DEFAULT_BASE_URL = "https://realevents.co/api/v1";

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
    const data = (await response.json()) as { error?: unknown };
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
    headers: { "Content-Type": "application/json", Accept: "application/json" }
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
