import { describe, it, expect } from "vitest";
import { transformFlightsToRoutes } from "./flight-routes";

const mockFlight = (overrides = {}) => ({
  id: "flight-1",
  category: "commercial",
  departure_airport: {
    latitude: 40.6413,
    longitude: -73.7781,
    iata_code: "JFK",
    ident: "KJFK",
    name: "John F Kennedy Intl",
  },
  arrival_airport: {
    latitude: 33.9425,
    longitude: -118.4081,
    iata_code: "LAX",
    ident: "KLAX",
    name: "Los Angeles Intl",
  },
  ...overrides,
});

describe("transformFlightsToRoutes", () => {
  it("maps flight data to FlightRoute shape", () => {
    const routes = transformFlightsToRoutes([mockFlight()]);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      id: "flight-1",
      category: "commercial",
      departure: {
        lat: 40.6413,
        lng: -73.7781,
        code: "JFK",
        name: "John F Kennedy Intl",
      },
      arrival: {
        lat: 33.9425,
        lng: -118.4081,
        code: "LAX",
        name: "Los Angeles Intl",
      },
    });
  });

  it("filters out flights with missing departure_airport", () => {
    const routes = transformFlightsToRoutes([
      mockFlight(),
      mockFlight({ id: "flight-2", departure_airport: null }),
    ]);
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe("flight-1");
  });

  it("filters out flights with missing arrival_airport", () => {
    const routes = transformFlightsToRoutes([
      mockFlight({ arrival_airport: null }),
    ]);
    expect(routes).toHaveLength(0);
  });

  it("falls back to ident when iata_code is null", () => {
    const routes = transformFlightsToRoutes([
      mockFlight({
        departure_airport: {
          latitude: 30.0,
          longitude: -90.0,
          iata_code: null,
          ident: "K1A0",
          name: "Small GA Field",
        },
      }),
    ]);
    expect(routes[0].departure.code).toBe("K1A0");
  });

  it("handles empty array", () => {
    expect(transformFlightsToRoutes([])).toEqual([]);
  });

  it("preserves category for general_aviation", () => {
    const routes = transformFlightsToRoutes([
      mockFlight({ category: "general_aviation" }),
    ]);
    expect(routes[0].category).toBe("general_aviation");
  });
});
