import { describe, it, expect } from "vitest";
import {
  stateNameToAbbrev,
  stateAbbrevToName,
  isoRegionToStateAbbrev,
} from "./us-state-codes";

describe("stateNameToAbbrev", () => {
  it("converts state names to abbreviations", () => {
    expect(stateNameToAbbrev("Washington")).toBe("WA");
    expect(stateNameToAbbrev("Texas")).toBe("TX");
    expect(stateNameToAbbrev("New York")).toBe("NY");
  });

  it("handles territories", () => {
    expect(stateNameToAbbrev("District of Columbia")).toBe("DC");
    expect(stateNameToAbbrev("Puerto Rico")).toBe("PR");
  });

  it("returns undefined for unknown names", () => {
    expect(stateNameToAbbrev("Narnia")).toBeUndefined();
    expect(stateNameToAbbrev("")).toBeUndefined();
  });
});

describe("stateAbbrevToName", () => {
  it("converts abbreviations to state names", () => {
    expect(stateAbbrevToName("WA")).toBe("Washington");
    expect(stateAbbrevToName("CA")).toBe("California");
  });

  it("returns undefined for unknown abbreviations", () => {
    expect(stateAbbrevToName("ZZ")).toBeUndefined();
  });
});

describe("isoRegionToStateAbbrev", () => {
  it("extracts state abbreviation from US iso_region", () => {
    expect(isoRegionToStateAbbrev("US-WA")).toBe("WA");
    expect(isoRegionToStateAbbrev("US-TX")).toBe("TX");
    expect(isoRegionToStateAbbrev("US-NY")).toBe("NY");
  });

  it("returns undefined for non-US regions", () => {
    expect(isoRegionToStateAbbrev("CA-ON")).toBeUndefined();
    expect(isoRegionToStateAbbrev("GB-ENG")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(isoRegionToStateAbbrev("")).toBeUndefined();
  });
});
