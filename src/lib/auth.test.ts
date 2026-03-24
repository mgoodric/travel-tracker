import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";
import { getUserId } from "./auth";

const mockHeaders = headers as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  mockHeaders.mockReset();
});

describe("getUserId", () => {
  it("returns APP_USER_ID when x-email header is present", async () => {
    vi.stubEnv("APP_USER_ID", "test-user-uuid");
    mockHeaders.mockResolvedValue(new Map([["x-email", "user@example.com"]]));

    const userId = await getUserId();
    expect(userId).toBe("test-user-uuid");
  });

  it("returns DEV_USER_ID as fallback when no email header", async () => {
    vi.stubEnv("DEV_USER_ID", "dev-user-uuid");
    mockHeaders.mockResolvedValue(new Map());

    const userId = await getUserId();
    expect(userId).toBe("dev-user-uuid");
  });

  it("throws when no email header and no DEV_USER_ID", async () => {
    vi.stubEnv("APP_USER_ID", "");
    vi.stubEnv("DEV_USER_ID", "");
    mockHeaders.mockResolvedValue(new Map());

    await expect(getUserId()).rejects.toThrow("Not authenticated");
  });

  it("prefers APP_USER_ID over DEV_USER_ID when email present", async () => {
    vi.stubEnv("APP_USER_ID", "app-uuid");
    vi.stubEnv("DEV_USER_ID", "dev-uuid");
    mockHeaders.mockResolvedValue(new Map([["x-email", "user@example.com"]]));

    const userId = await getUserId();
    expect(userId).toBe("app-uuid");
  });
});
