/** Full state name → 2-letter abbreviation (and reverse) */
const STATE_MAP: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
  "Puerto Rico": "PR", "Guam": "GU", "American Samoa": "AS",
  "U.S. Virgin Islands": "VI", "Northern Mariana Islands": "MP",
};

const ABBREV_TO_NAME = Object.fromEntries(
  Object.entries(STATE_MAP).map(([name, abbrev]) => [abbrev, name])
);

/** Convert full state name to 2-letter abbreviation */
export function stateNameToAbbrev(name: string): string | undefined {
  return STATE_MAP[name];
}

/** Convert 2-letter abbreviation to full state name */
export function stateAbbrevToName(abbrev: string): string | undefined {
  return ABBREV_TO_NAME[abbrev];
}

/** Extract state abbreviation from airport iso_region like "US-WA" → "WA" */
export function isoRegionToStateAbbrev(isoRegion: string): string | undefined {
  if (!isoRegion.startsWith("US-")) return undefined;
  return isoRegion.slice(3);
}
