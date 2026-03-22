import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsGridProps {
  stats: {
    flights: number;
    miles: number;
    countries: number;
    airports: number;
  };
}

export function StatsGrid({ stats }: StatsGridProps) {
  const items = [
    { label: "Total Flights", value: stats.flights.toLocaleString() },
    { label: "Total Miles", value: stats.miles.toLocaleString() },
    { label: "Most Countries", value: stats.countries.toLocaleString() },
    { label: "Most Airports", value: stats.airports.toLocaleString() },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
