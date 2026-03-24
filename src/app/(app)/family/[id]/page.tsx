import Link from "next/link";
import { notFound } from "next/navigation";
import sql from "@/lib/db";
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

  // Fetch member, flights, and visits in parallel
  const [[member], memberFlights, memberVisitRows] = await Promise.all([
    sql`SELECT * FROM family_members WHERE id = ${id}`,
    sql`
    SELECT f.*,
      jsonb_build_object('id', da.id, 'ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude, 'elevation_ft', da.elevation_ft, 'type', da.type, 'municipality', da.municipality, 'iso_country', da.iso_country, 'iso_region', da.iso_region) AS departure_airport,
      jsonb_build_object('id', aa.id, 'ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude, 'elevation_ft', aa.elevation_ft, 'type', aa.type, 'municipality', aa.municipality, 'iso_country', aa.iso_country, 'iso_region', aa.iso_region) AS arrival_airport,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('role', fp2.role, 'family_member_id', fp2.family_member_id, 'family_member', jsonb_build_object('id', fm2.id, 'name', fm2.name, 'relationship', fm2.relationship, 'user_id', fm2.user_id, 'created_at', fm2.created_at, 'updated_at', fm2.updated_at)))
         FROM flight_passengers fp2 JOIN family_members fm2 ON fm2.id = fp2.family_member_id
         WHERE fp2.flight_id = f.id), '[]'::jsonb
      ) AS passengers
    FROM flight_passengers fp
    JOIN flights f ON f.id = fp.flight_id
    JOIN airports da ON da.id = f.departure_airport_id
    JOIN airports aa ON aa.id = f.arrival_airport_id
    WHERE fp.family_member_id = ${id}
    ORDER BY f.departure_date DESC
  `,
    sql`
    SELECT v.*,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', fm2.id, 'name', fm2.name, 'relationship', fm2.relationship, 'user_id', fm2.user_id, 'created_at', fm2.created_at, 'updated_at', fm2.updated_at))
         FROM visit_members vm2 JOIN family_members fm2 ON fm2.id = vm2.family_member_id
         WHERE vm2.visit_id = v.id), '[]'::jsonb
      ) AS members
    FROM visit_members vm
    JOIN visits v ON v.id = vm.visit_id
    WHERE vm.family_member_id = ${id}
    ORDER BY v.visit_date DESC NULLS LAST
  `,
  ]);

  if (!member) notFound();

  const flights = memberFlights as unknown as FlightWithAirports[];
  const visits = memberVisitRows as unknown as VisitWithMembers[];

  // Compute flight stats
  let gaFlights = 0;
  let commercialFlights = 0;
  let totalMiles = 0;
  const uniqueAirports = new Set<number>();

  const gaStateNames = new Set<string>();

  for (const f of flights) {
    if (f.category === "general_aviation") {
      gaFlights++;
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

  // Derive visited states/countries from visits only
  const visitedStateNames = new Set<string>();
  const visitedCountryNames = new Set<string>();

  for (const v of visits) {
    if (v.country) visitedCountryNames.add(v.country);
    if (v.state && v.country === "United States") visitedStateNames.add(v.state);
  }

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

      {routes.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Flight Map</h2>
          <FlightMap routes={routes} height="400px" showLegend />
        </div>
      )}

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
