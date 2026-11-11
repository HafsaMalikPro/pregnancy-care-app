import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, api, errorMessage } from "./api";

const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("sends credentials and JSON, and returns the body", async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    await expect(api("/v1/x", { method: "POST", body: { a: 1 }, query: { q: "z", empty: "" } })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://localhost:4000/v1/x?q=z");
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: '{"a":1}' });
  });

  it("parses the Nest error envelope with field details", async () => {
    vi.stubGlobal("fetch", respond(400, {
      error: { code: "VALIDATION_ERROR", message: "Invalid", details: [{ path: "lmpDate", message: "lmpDate cannot be in the future" }] },
    }));
    const err = (await api("/v1/x").catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(errorMessage(err)).toBe("lmpDate cannot be in the future");
  });

  it("parses Better Auth errors and rate limits", async () => {
    vi.stubGlobal("fetch", respond(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }));
    expect(errorMessage(await api("/v1/auth/sign-in/email").catch((e) => e))).toBe("Invalid email or password");
    vi.stubGlobal("fetch", respond(429, { error: { code: "RATE_LIMITED", message: "x" } }));
    expect(errorMessage(await api("/v1/x").catch((e) => e))).toMatch(/Too many attempts/);
  });

  it("reports network failures clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(errorMessage(await api("/v1/x").catch((e) => e))).toMatch(/Can't reach the server/);
  });
});
