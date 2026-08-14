import { describe, expect, it } from "vitest";
import {
  assertSafeImageUrl,
  describeResolution,
  readImageWidth
} from "../../src/tools/set-cover.js";

// PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(b.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

// The dimensions must be measured from the BYTES, not read off the upload
// response: upload_cover returns manage_event_json, which omits cover_width and
// cover_height entirely, so trusting it meant the warning never fired.
describe("readImageWidth", () => {
  it("reads the width and height out of a PNG header", () => {
    expect(readImageWidth(pngBytes(659, 465))).toEqual({ width: 659, height: 465 });
  });

  it("reads a large PNG correctly", () => {
    expect(readImageWidth(pngBytes(2500, 1824))).toEqual({ width: 2500, height: 1824 });
  });

  it("returns null for bytes it cannot parse rather than throwing", () => {
    expect(readImageWidth(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(() => readImageWidth(new Uint8Array(0))).not.toThrow();
  });
});

// The server fetches a URL the caller supplies, so it can be pointed at addresses
// the caller could not otherwise reach - cloud metadata endpoints, localhost admin
// panels, private LAN hosts. These tests pin the guard that prevents that. They are
// the load-bearing part of this tool; the upload itself is a thin wrapper.
describe("assertSafeImageUrl", () => {
  it("accepts an ordinary public https image", () => {
    expect(() => assertSafeImageUrl("https://example.com/flyer.jpg")).not.toThrow();
  });

  it("accepts http as well as https", () => {
    expect(() => assertSafeImageUrl("http://example.com/flyer.jpg")).not.toThrow();
  });

  it.each([
    ["file:///etc/passwd", "file"],
    ["ftp://example.com/x.jpg", "ftp"],
    ["data:image/png;base64,iVBORw0KGgo=", "data"],
    ["gopher://example.com/x", "gopher"]
  ])("rejects the %s scheme", (url) => {
    expect(() => assertSafeImageUrl(url)).toThrow(/http/i);
  });

  // Each of these is a real SSRF target, not a hypothetical one.
  it.each([
    ["http://localhost/admin", "localhost"],
    ["http://127.0.0.1/admin", "loopback"],
    ["http://[::1]/admin", "IPv6 loopback"],
    ["http://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["http://10.0.0.5/internal", "private 10.x"],
    ["http://192.168.1.1/router", "private 192.168.x"],
    ["http://172.16.0.1/internal", "private 172.16-31.x"],
    ["http://0.0.0.0/", "unspecified"]
  ])("rejects %s (%s)", (url) => {
    expect(() => assertSafeImageUrl(url)).toThrow(/private|local|not allowed/i);
  });

  it("rejects a host that is not a URL at all", () => {
    expect(() => assertSafeImageUrl("not a url")).toThrow();
  });

  // 172.32 is OUTSIDE the private 172.16-31 range: the guard must not over-block.
  it("does not over-block a public address that merely looks private", () => {
    expect(() => assertSafeImageUrl("http://172.32.0.1/x.jpg")).not.toThrow();
    expect(() => assertSafeImageUrl("http://11.0.0.1/x.jpg")).not.toThrow();
  });
});

describe("describeResolution", () => {
  // A Google thumbnail (659x465) uploads happily and then looks soft on a wide
  // hero. Silently accepting it is the behaviour we are fixing.
  it("warns when the image is too small to be a good cover", () => {
    expect(describeResolution(659, 465)).toMatch(/small|soft|1200/i);
  });

  it("says nothing for a comfortably large image", () => {
    expect(describeResolution(1600, 1167)).toBe("");
  });

  it("says nothing when the dimensions are unknown", () => {
    expect(describeResolution(null, null)).toBe("");
    expect(describeResolution(undefined, undefined)).toBe("");
  });

  it("treats exactly the threshold as acceptable", () => {
    expect(describeResolution(1200, 800)).toBe("");
  });

  it("warns just below the threshold", () => {
    expect(describeResolution(1199, 800)).toMatch(/small|soft|1200/i);
  });
});
