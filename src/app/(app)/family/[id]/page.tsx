import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { MemberDetailContent } from "@/components/family/member-detail-content";
import { transformFlightsToRoutes } from "@/lib/flight-routes";
import { COUNTRY_TO_ISO3, ISO2_TO_COUNTRY } from "@/lib/geo-mappings";
import { stateAbbrevToName, isoRegionToStateAbbrev } from "@/lib/geo/us-state-codes";
import type { FlightWithAirports, VisitWithMembers } from "@/lib/types/database";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FamilyMemberPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch member
  const { data: member } = await supabase
    .from("family_members")
    .select("*")
    .eq("id", id)
    .single();

  if (!member) notFound();

  // Fetch flights by joining through flight_passengers (avoids .in() URL length limit)
  const { data: memberFlightRows } = await supabase
    .from("flight_passengers")
    .select(`
      flight:flights(
        *,
        departure_airport:airports!departure_airport_id(*),
        arrival_airport:airports!arrival_airport_id(*),
        passengers:flight_passengers(*, family_member:family_members(*))
      )
    `)
    .eq("family_member_id", id);

  const flights = (memberFlightRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.flight)
    .filter(Boolean)
    .sort((a: FlightWithAirports, b: FlightWithAirports) =>
      b.departure_date.localeCompare(a.departure_date)
    ) as FlightWithAirports[];

  // Fetch visits by joining through visit_members
  const { data: memberVisitRows } = await supabase
    .from("visit_members")
    .select(`
      visit:visits(
        *,
        members:visit_members(*, family_member:family_members(*))
      )
    `)
    .eq("family_member_id", id);

  const visits = (memberVisitRows ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      ...r.visit,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      members: (r.visit?.members ?? []).map((m: any) => m.family_member),
    }))
    .filter((v: VisitWithMembers) => v.id)
    .sort((a: VisitWithMembers, b: VisitWithMembers) =>
      (b.visit_date ?? "").localeCompare(a.visit_date ?? "")
    ) as VisitWithMembers[];

  // Compute flight stats
  let gaFlights = 0;
  let commercialFlights = 0;
  let totalMiles = 0;
  const uniqueAirports = new Set<number>();

  const gaStateNames = new Set<string>();

  for (const f of flights) {
    if (f.category === "general_aviation") {
      gaFlights++;
      // Track GA-visited US states
      for (const airport of [f.departure_airport, f.arrival_airport]) {
        if (airport.iso_country === "US" && airport.iso_region) {
          const abbr = isoRegionToStateAbbrev(airport.iso_region);
          if (abbr) {
            const sn = stateAbbrevToName(abbr);
            if (sn) gaStateNames.add(sn);
          }
        }
      }
    } else {
      commercialFlights++;
    }
    totalMiles += f.distance_miles ?? 0;
    uniqueAirports.add(f.departure_airport_id);
    uniqueAirports.add(f.arrival_airport_id);
  }

  // Derive visited states/countries from visits only (not flight airports)
  // This avoids counting layover airports as visited states
  const visitedStateNames = new Set<string>();
  const visitedCountryNames = new Set<string>();

  for (const v of visits) {
    if (v.country) visitedCountryNames.add(v.country);
    if (v.state && v.country === "United States") visitedStateNames.add(v.state);
  }

  // Convert to codes for choropleths
  const visitedCountryCodes = new Set<string>();
  for (const name of visitedCountryNames) {
    const code = COUNTRY_TO_ISO3[name];
    if (code) visitedCountryCodes.add(code);
  }

  const routes = transformFlightsToRoutes(flights);

  // Pre-compute state/country arrays per flight for client-side filtering
  const filterableFlights = flights.map((f) => {
    const flightStates: string[] = [];
    const flightCountries: string[] = [];
    for (const airport of [f.departure_airport, f.arrival_airport]) {
      if (airport.iso_country === "US") {
        flightCountries.push("United States");
        if (airport.iso_region) {
          const abbr = isoRegionToStateAbbrev(airport.iso_region);
          if (abbr) {
            const sn = stateAbbrevToName(abbr);
            if (sn) flightStates.push(sn);
          }
        }
      } else {
        const cn = ISO2_TO_COUNTRY[airport.iso_country];
        if (cn) flightCountries.push(cn);
      }
    }
    return { ...f, _states: flightStates, _countries: flightCountries };
  });

  const filterableVisits = visits.map((v) => ({
    ...v,
    members: v.members.map((m) => ({ family_member: { name: m.name } })),
  }));

  const stats = [
    { label: "GA Flights", value: gaFlights },
    { label: "Commercial Flights", value: commercialFlights },
    { label: "Total Miles", value: totalMiles.toLocaleString() },
    { label: "Airports", value: uniqueAirports.size },
    { label: "States", value: visitedStateNames.size },
    { label: "Countries", value: visitedCountryNames.size },
    { label: "Visits", value: visits.length },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/family"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Family
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{member.name}</h1>
          <Badge variant="secondary">{member.relationship}</Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flight Map */}
      {routes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Flight Map</h2>
          <FlightMap routes={routes} height="400px" showLegend />
        </div>
      )}

      {/* Choropleths + Filterable States/Countries + Flights/Visits */}
      <MemberDetailContent
        allStates={Array.from(visitedStateNames).sort()}
        gaStates={Array.from(gaStateNames).sort()}
        countries={Array.from(visitedCountryNames).sort()}
        visitedCountryCodes={Array.from(visitedCountryCodes)}
        flights={filterableFlights}
        visits={filterableVisits}
      />
    </div>
  );
}
