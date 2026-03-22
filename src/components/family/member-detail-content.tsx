"use client";

import { useState } from "react";
import { USStatesChoropleth } from "@/components/maps/us-states-choropleth";
import { ChoroplethMap } from "@/components/maps/choropleth-map-dynamic";
import { MemberDetailFilter } from "./member-detail-filter";

interface FilterableFlight {
  id: string;
  category: string;
  airline: string | null;
  flight_number: string | null;
  aircraft_type: string | null;
  tail_number: string | null;
  departure_date: string;
  distance_miles: number | null;
  departure_airport: { ident: string; iata_code: string | null; municipality: string | null; iso_country: string; iso_region: string };
  arrival_airport: { ident: string; iata_code: string | null; municipality: string | null; iso_country: string; iso_region: string };
  passengers?: { family_member: { name: string } }[];
  _states: string[];
  _countries: string[];
}

interface FilterableVisit {
  id: string;
  visit_date: string | null;
  city: string | null;
  state: string | null;
  country: string;
  notes: string | null;
  members?: { family_member: { name: string } }[];
}

interface MemberDetailContentProps {
  allStates: string[];
  gaStates: string[];
  countries: string[];
  visitedCountryCodes: string[];
  flights: FilterableFlight[];
  visits: FilterableVisit[];
}

export function MemberDetailContent({
  allStates,
  gaStates,
  countries,
  visitedCountryCodes,
  flights,
  visits,
}: MemberDetailContentProps) {
  const [gaOnly, setGaOnly] = useState(false);

  return (
    <>
      {/* Choropleth Maps */}
      <div className="grid gap-6 md:grid-cols-2">
        <USStatesChoropleth
          allStates={allStates}
          gaStates={gaStates}
          gaOnly={gaOnly}
        />
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Countries ({countries.length})
          </h2>
          <ChoroplethMap
            geoJsonUrl="/geo/world-countries.json"
            visitedCodes={new Set(visitedCountryCodes)}
            featureCodeProperty="ISO_A3"
            featureNameProperty="NAME"
            height="300px"
          />
        </div>
      </div>

      {/* Filterable States/Countries + Flights/Visits */}
      <MemberDetailFilter
        states={allStates}
        gaStates={gaStates}
        countries={countries}
        flights={flights}
        visits={visits}
        onGaFilterChange={setGaOnly}
      />
    </>
  );
}
