import { notFound } from "next/navigation";
import Link from "next/link";
import sql from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteFlightButton } from "@/components/flights/delete-flight-button";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { transformFlightsToRoutes } from "@/lib/flight-routes";

export default async function FlightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [flight] = await sql`
    SELECT f.*,
      jsonb_build_object('id', da.id, 'ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude, 'elevation_ft', da.elevation_ft, 'type', da.type, 'municipality', da.municipality, 'iso_country', da.iso_country, 'iso_region', da.iso_region) AS departure_airport,
      jsonb_build_object('id', aa.id, 'ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude, 'elevation_ft', aa.elevation_ft, 'type', aa.type, 'municipality', aa.municipality, 'iso_country', aa.iso_country, 'iso_region', aa.iso_region) AS arrival_airport,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('role', fp.role, 'family_member', jsonb_build_object('id', fm.id, 'name', fm.name)))
         FROM flight_passengers fp JOIN family_members fm ON fm.id = fp.family_member_id
         WHERE fp.flight_id = f.id), '[]'::jsonb
      ) AS flight_passengers
    FROM flights f
    JOIN airports da ON da.id = f.departure_airport_id
    JOIN airports aa ON aa.id = f.arrival_airport_id
    WHERE f.id = ${id}
  `;

  if (!flight) notFound();

  const depAirport = flight.departure_airport as { ident: string; iata_code: string | null; name: string; municipality: string | null; latitude: number; longitude: number };
  const arrAirport = flight.arrival_airport as { ident: string; iata_code: string | null; name: string; municipality: string | null; latitude: number; longitude: number };

  const mapRoute = transformFlightsToRoutes([flight]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Flight Details</h1>
        <div className="flex gap-2">
          <Link href={`/flights/${id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <DeleteFlightButton flightId={id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">
              {depAirport.ident} → {arrAirport.ident}
            </CardTitle>
            <Badge>{flight.category === "commercial" ? "Commercial" : "General Aviation"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Departure</p>
              <p className="font-semibold">{depAirport.name}</p>
              <p className="text-sm text-muted-foreground">{depAirport.municipality}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Arrival</p>
              <p className="font-semibold">{arrAirport.name}</p>
              <p className="text-sm text-muted-foreground">{arrAirport.municipality}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p>{new Date(flight.departure_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Distance</p>
              <p>{flight.distance_miles?.toLocaleString() ?? "N/A"} miles</p>
            </div>
            {flight.category === "commercial" ? (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Flight</p>
                <p>{flight.airline} {flight.flight_number}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Aircraft</p>
                <p>{flight.aircraft_type} {flight.tail_number ? `(${flight.tail_number})` : ""}</p>
              </div>
            )}
          </div>

          {flight.category === "commercial" && (flight.seat || flight.cabin_class || flight.booking_reference) && (
            <div className="grid gap-4 sm:grid-cols-3">
              {flight.seat && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Seat</p>
                  <p>{flight.seat}{flight.seat_type ? ` (${flight.seat_type})` : ""}</p>
                </div>
              )}
              {flight.cabin_class && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cabin</p>
                  <p className="capitalize">{flight.cabin_class.replace("_", " ")}</p>
                </div>
              )}
              {flight.booking_reference && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">PNR</p>
                  <p className="font-mono">{flight.booking_reference}</p>
                </div>
              )}
            </div>
          )}

          {(flight.departure_terminal || flight.departure_gate || flight.arrival_terminal || flight.arrival_gate) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(flight.departure_terminal || flight.departure_gate) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Departure</p>
                  <p>
                    {flight.departure_terminal ? `Terminal ${flight.departure_terminal}` : ""}
                    {flight.departure_terminal && flight.departure_gate ? ", " : ""}
                    {flight.departure_gate ? `Gate ${flight.departure_gate}` : ""}
                  </p>
                </div>
              )}
              {(flight.arrival_terminal || flight.arrival_gate) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Arrival</p>
                  <p>
                    {flight.arrival_terminal ? `Terminal ${flight.arrival_terminal}` : ""}
                    {flight.arrival_terminal && flight.arrival_gate ? ", " : ""}
                    {flight.arrival_gate ? `Gate ${flight.arrival_gate}` : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {flight.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p>{flight.notes}</p>
            </div>
          )}

          {flight.flight_passengers && flight.flight_passengers.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Passengers</p>
              <div className="flex flex-wrap gap-2">
                {flight.flight_passengers.map((fp: { role: string; family_member: { id: string; name: string } }) => (
                  <Badge key={fp.family_member.id} variant="outline">
                    {fp.family_member.name} ({fp.role})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FlightMap routes={mapRoute} height="300px" showLegend={false} />
    </div>
  );
}
