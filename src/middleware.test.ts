import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

beforeEach(() => {
  vi.unstubAllEnvs();
});

function createRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/dashboard", { headers });
}

describe("middleware", () => {
  it("allows request when x-email header is present", () => {
    const response = middleware(createRequest({ "x-email": "user@example.com" }));
    // NextResponse.next() returns a response with no status override (200-range)
    expect(response.status).not.toBe(401);
  });

  it("returns 401 when no x-email and no DEV_USER_ID", () => {
    vi.stubEnv("DEV_USER_ID", "");
    const response = middleware(createRequest());
    expect(response.status).toBe(401);
  });

  it("allows request when DEV_USER_ID is set (dev mode)", () => {
    vi.stubEnv("DEV_USER_ID", "dev-user-uuid");
    const response = middleware(createRequest());
    expect(response.status).not.toBe(401);
  });

  it("allows request when both x-email and DEV_USER_ID present", () => {
    vi.stubEnv("DEV_USER_ID", "dev-user-uuid");
    const response = middleware(
      createRequest({ "x-email": "user@example.com" })
    );
    expect(response.status).not.toBe(401);
  });
});
