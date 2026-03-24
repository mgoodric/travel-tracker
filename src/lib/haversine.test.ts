import { describe, it, expect } from "vitest";
import { haversineMiles } from "./haversine";

describe("haversineMiles", () => {
  it("calculates JFK to LAX correctly (~2,475 miles)", () => {
    // JFK: 40.6413, -73.7781 | LAX: 33.9425, -118.4081
    const distance = haversineMiles(40.6413, -73.7781, 33.9425, -118.4081);
    expect(distance).toBeGreaterThan(2400);
    expect(distance).toBeLessThan(2550);
  });

  it("calculates London to Tokyo correctly (~5,960 miles)", () => {
    // LHR: 51.4700, -0.4543 | NRT: 35.7647, 140.3864
    const distance = haversineMiles(51.47, -0.4543, 35.7647, 140.3864);
    expect(distance).toBeGreaterThan(5900);
    expect(distance).toBeLessThan(6050);
  });

  it("returns 0 for same point", () => {
    const distance = haversineMiles(40.6413, -73.7781, 40.6413, -73.7781);
    expect(distance).toBe(0);
  });

  it("calculates antipodal points (~12,450 miles)", () => {
    // North pole to south pole
    const distance = haversineMiles(90, 0, -90, 0);
    expect(distance).toBeGreaterThan(12400);
    expect(distance).toBeLessThan(12500);
  });

  it("returns a rounded integer", () => {
    const distance = haversineMiles(40.6413, -73.7781, 33.9425, -118.4081);
    expect(Number.isInteger(distance)).toBe(true);
  });

  it("handles short distances", () => {
    // Two points ~1 mile apart in Manhattan
    const distance = haversineMiles(40.748, -73.986, 40.762, -73.986);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThan(5);
  });
});
