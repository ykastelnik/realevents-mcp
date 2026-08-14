import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveManageToken } from "../lib/manage-token.js";
import { fail, ok, publicBase, runTool, type ToolResult } from "../lib/tool-runtime.js";
import type { ApiEvent } from "../types.js";

/** Mirrors the server's own allowlist in ManageController#upload_cover. */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** The server rejects anything larger, so fail early rather than upload and 422. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Below this the cover looks soft on a wide hero. Not enforced, only reported. */
const COMFORTABLE_WIDTH = 1200;

/**
 * Refuses URLs that would make the server fetch something the caller could not
 * reach directly. This tool takes an address from the caller and dereferences it,
 * which is the textbook SSRF shape: without this guard an assistant could be talked
 * into pulling a cloud metadata endpoint, a localhost admin panel, or a private LAN
 * host, and the response body would end up published on a public event page.
 *
 * This blocks the literal-address cases. It cannot stop a public hostname that
 * resolves to a private address (DNS rebinding); defending that needs resolution
 * before connect, which is out of scope for a tool whose sole job is a cover image.
 */
export function assertSafeImageUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`"${input}" is not a valid URL. Provide a public http(s) image address.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http and https URLs are supported, not "${url.protocol}".`);
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    throw new Error("Refusing to fetch a local address.");
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number) as [number, number, number, number];
    const isPrivate =
      a === 127 || // loopback
      a === 10 || // private
      a === 0 || // unspecified
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254); // link-local, incl. cloud metadata
    if (isPrivate) {
      throw new Error(`Refusing to fetch the private or local address ${host}.`);
    }
  }

  return url;
}

/**
 * Reads the pixel size straight out of the image header.
 *
 * The upload endpoint responds with manage_event_json, which does NOT carry
 * cover_width/cover_height (only the public event payload does), so reading the
 * size off the response silently yielded undefined and the size warning never
 * fired. Measuring the bytes we are about to send is both reliable and more
 * honest: it describes what the user actually supplied, before the server's
 * resize.
 *
 * Returns null for anything it cannot parse; a missing warning is a far better
 * outcome than a failed upload.
 */
export function readImageWidth(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PNG: 8-byte signature, then IHDR with two big-endian uint32s.
    if (bytes.byteLength >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    // WebP: "RIFF"...."WEBP", then a VP8/VP8L/VP8X chunk, each storing size
    // differently.
    if (bytes.byteLength >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === "VP8 ") {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff
        };
      }
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") {
        const w = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16);
        const h = bytes[27]! | ((bytes[28]! << 16) >> 8) | (bytes[29]! << 16);
        return { width: w + 1, height: h + 1 };
      }
    }

    // JPEG: walk the segment markers to the SOFn frame header.
    if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.byteLength) {
        // eslint-disable-next-line security/detect-object-injection -- numeric index into a Uint8Array, bounds-checked by the loop condition
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1]!;
        // SOF0-SOF15, excluding the non-frame markers DHT/JPG/DAC.
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + view.getUint16(offset + 2);
      }
    }
  } catch {
    // Malformed or truncated header: fall through to null.
  }
  return null;
}

/** A note when the image is too small to make a good cover. Empty when it is fine. */
export function describeResolution(
  width: number | null | undefined,
  height: number | null | undefined
): string {
  if (!width || !height) return "";
  if (width >= COMFORTABLE_WIDTH) return "";
  return (
    `Note: ${width}x${height} is small for a cover and may look soft on wide screens. ` +
    `Around ${COMFORTABLE_WIDTH}px wide or more works best.`
  );
}

export interface SetCoverInput {
  manage_token?: string;
  image_url: string;
}

export async function handleSetCover(input: SetCoverInput): Promise<ToolResult> {
  return runTool(async () => {
    const token = resolveManageToken(input.manage_token);

    let url: URL;
    try {
      url = assertSafeImageUrl(input.image_url);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      return fail(`Could not download the image: HTTP ${response.status} from ${url.hostname}.`);
    }

    // Trust the served content type over the file extension: the API checks magic
    // bytes anyway, so a wrong type here would fail server-side with a vaguer error.
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!ALLOWED_TYPES.includes(contentType)) {
      return fail(
        `That URL returned "${contentType || "an unknown type"}". ` +
          `Covers must be JPEG, PNG or WebP.`
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      return fail(
        `That image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`
      );
    }

    // The upload endpoint is multipart, unlike every other call in this package, so
    // it deliberately bypasses apiCall (which is JSON-only). FormData sets its own
    // boundary; setting Content-Type by hand here would corrupt the request.
    const extension =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const form = new FormData();
    form.append("cover", new Blob([bytes], { type: contentType }), `cover.${extension}`);

    const base =
      process.env.REALEVENTS_API_URL?.trim().replace(/\/$/, "") ?? "https://realevents.co/api/v1";
    const upload = await fetch(`${base}/manage/${token}/cover`, { method: "POST", body: form });
    const payload = (await upload.json().catch(() => ({}))) as {
      event?: ApiEvent;
      error?: string;
    };

    if (!upload.ok) {
      return fail(payload.error ?? `Upload failed: HTTP ${upload.status}.`);
    }

    const event = payload.event;
    const lines = [`Cover image set for "${event?.title ?? "the event"}".`];
    // Measured from the bytes we sent, not the response: manage_event_json carries
    // no cover_width/cover_height, so reading it there produced no warning at all.
    const size = readImageWidth(bytes);
    const note = describeResolution(size?.width, size?.height);
    if (note) lines.push(note);
    if (event?.slug) lines.push("", `See it: ${publicBase()}/e/${event.slug}`);

    return ok(lines.join("\n"));
  });
}

const inputSchema = {
  manage_token: z
    .string()
    .optional()
    .describe("Manage token. Falls back to REALEVENTS_MANAGE_TOKEN env var if omitted."),
  image_url: z
    .string()
    .min(1)
    .describe(
      "Public http(s) URL of the image to use. JPEG, PNG or WebP, under 5MB. " +
        "Around 1200px wide or more looks best; smaller images render soft."
    )
};

export function registerSetCover(server: McpServer): void {
  server.registerTool(
    "set_cover",
    {
      description: [
        "Set an event's cover image from a public image URL. The image must already",
        "be online: this cannot upload a file from the user's computer, so if they",
        "have a local image, point them at the manage page instead. Replaces any",
        "existing cover. Requires the manage token."
      ].join(" "),
      inputSchema
    },
    async (args) => handleSetCover(args)
  );
}
