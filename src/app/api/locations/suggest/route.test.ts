import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/db", () => {
  const mockSql = vi.fn();
  mockSql.mockResolvedValue([]);
  return { default: mockSql };
});

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

import sql from "@/lib/db";
import { GET } from "./route";

const mockSql = sql as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

function createRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/locations/suggest");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

describe("GET /api/locations/suggest", () => {
  it("returns empty array for missing field param", async () => {
    const response = await GET(createRequest({}));
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("returns empty array for invalid field param", async () => {
    const response = await GET(createRequest({ field: "invalid" }));
    const data = await response.json();
    expect(data).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("queries countries when field=country", async () => {
    mockSql.mockResolvedValue([
      { value: "United States" },
      { value: "Canada" },
    ]);

    const response = await GET(createRequest({ field: "country" }));
    const data = await response.json();
    expect(data).toEqual(["United States", "Canada"]);
    expect(mockSql).toHaveBeenCalled();
  });

  it("queries states filtered by country", async () => {
    mockSql.mockResolvedValue([{ value: "Washington" }, { value: "Oregon" }]);

    const response = await GET(
      createRequest({ field: "state", country: "United States" })
    );
    const data = await response.json();
    expect(data).toEqual(["Washington", "Oregon"]);
  });

  it("queries cities filtered by country and state", async () => {
    mockSql.mockResolvedValue([{ value: "Seattle" }, { value: "Portland" }]);

    const response = await GET(
      createRequest({ field: "city", country: "United States", state: "Washington" })
    );
    const data = await response.json();
    expect(data).toEqual(["Seattle", "Portland"]);
  });

  it("filters out null values from results", async () => {
    mockSql.mockResolvedValue([{ value: "Seattle" }, { value: null }]);

    const response = await GET(createRequest({ field: "city" }));
    const data = await response.json();
    expect(data).toEqual(["Seattle"]);
  });
});
