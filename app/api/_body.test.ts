import { describe, it, expect } from "vitest";
import { readJsonWithLimit } from "./_body";

describe("readJsonWithLimit", () => {
  it("parses a valid JSON object", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });
    expect(await readJsonWithLimit(req)).toEqual({ hello: "world" });
  });

  it("parses a JSON array", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "[1,2,3]",
    });
    expect(await readJsonWithLimit(req)).toEqual([1, 2, 3]);
  });

  it("returns null for invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not valid json }{",
    });
    expect(await readJsonWithLimit(req)).toBeNull();
  });

  it("returns null when there is no body (GET request)", async () => {
    const req = new Request("http://localhost", { method: "GET" });
    expect(await readJsonWithLimit(req)).toBeNull();
  });

  it("returns undefined (too large sentinel) when body exceeds limit", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "123456", // 6 bytes
    });
    // limit = 5 bytes: 6 > 5 → too large
    expect(await readJsonWithLimit(req, 5)).toBeUndefined();
  });

  it("accepts body exactly at the limit (not exceeded)", async () => {
    const body = '{"x":1}'; // 7 bytes
    const req = new Request("http://localhost", { method: "POST", body });
    expect(await readJsonWithLimit(req, 7)).toEqual({ x: 1 });
  });

  it("returns null for JSON that is just whitespace / empty-ish", async () => {
    const req = new Request("http://localhost", { method: "POST", body: "   " });
    expect(await readJsonWithLimit(req)).toBeNull();
  });

  it("correctly assembles multi-chunk body (content larger than one chunk)", async () => {
    // Create a body that is several KB to stress the chunk assembly loop.
    const data = { payload: "x".repeat(4096) };
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(data),
    });
    expect(await readJsonWithLimit(req)).toEqual(data);
  });
});
