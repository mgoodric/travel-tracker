import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FlightCardProps {
  flight: {
    id: string;
    category: string;
    airline: string | null;
    flight_number: string | null;
    aircraft_type: string | null;
    tail_number: string | null;
    departure_date: string;
    distance_miles: number | null;
    departure_airport: { ident: string; iata_code: string | null; municipality: string | null };
    arrival_airport: { ident: string; iata_code: string | null; municipality: string | null };
    passengers?: { family_member: { name: string } }[];
  };
}

export function FlightCard({ flight }: FlightCardProps) {
  const depCode = flight.departure_airport.iata_code || flight.departure_airport.ident;
  const arrCode = flight.arrival_airport.iata_code || flight.arrival_airport.ident;

  return (
    <Link href={`/flights/${flight.id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <div className="w-20 text-center">
              <p className="text-2xl font-bold truncate">{depCode}</p>
              <p className="text-xs text-muted-foreground truncate">{flight.departure_airport.municipality}</p>
            </div>
            <div className="text-muted-foreground/60 shrink-0">&rarr;</div>
            <div className="w-20 text-center">
              <p className="text-2xl font-bold truncate">{arrCode}</p>
              <p className="text-xs text-muted-foreground truncate">{flight.arrival_airport.municipality}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            {flight.passengers && flight.passengers.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {flight.passengers.map((p) => (
                  <Badge key={p.family_member.name} variant="outline" className="text-xs">
                    {p.family_member.name}
                  </Badge>
                ))}
              </div>
            )}
            <div>
              <p className="text-sm">{new Date(flight.departure_date).toLocaleDateString()}</p>
              <p className="text-xs text-muted-foreground">
                {flight.distance_miles?.toLocaleString() ?? "?"} mi
              </p>
            </div>
            <div>
              <Badge variant="secondary">
                {flight.category === "commercial"
                  ? `${flight.airline} ${flight.flight_number}`
                  : flight.aircraft_type || "GA"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
