import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the db module
vi.mock("@/lib/db", () => {
  const mockSql = vi.fn();
  mockSql.mockResolvedValue([]);
  return { default: mockSql };
});

import sql from "@/lib/db";
import { GET } from "./route";

const mockSql = sql as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

function createRequest(query: string) {
  return new NextRequest(`http://localhost:3000/api/airports/search?q=${query}`);
}

describe("GET /api/airports/search", () => {
  it("returns empty array for missing query", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/airports/search"));
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("returns empty array for query shorter than 2 chars", async () => {
    const response = await GET(createRequest("J"));
    const data = await response.json();
    expect(data).toEqual([]);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("calls SQL for valid query", async () => {
    const mockResults = [
      { id: 1, ident: "KJFK", iata_code: "JFK", name: "John F Kennedy Intl" },
    ];
    mockSql.mockResolvedValue(mockResults);

    const response = await GET(createRequest("JFK"));
    const data = await response.json();
    expect(data).toEqual(mockResults);
    expect(mockSql).toHaveBeenCalled();
  });

  it("returns results as JSON", async () => {
    mockSql.mockResolvedValue([]);
    const response = await GET(createRequest("Austin"));
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
