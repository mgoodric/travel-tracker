"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlightCard } from "@/components/flights/flight-card";
import { VisitCard } from "@/components/visits/visit-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { bulkDeleteFlights } from "@/actions/flights";
import { bulkDeleteVisits } from "@/actions/visits";

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

interface MemberDetailFilterProps {
  states: string[];
  gaStates: string[];
  countries: string[];
  flights: FilterableFlight[];
  visits: FilterableVisit[];
  onGaFilterChange?: (gaOnly: boolean) => void;
}

type FilterType = "state" | "country";

export function MemberDetailFilter({ states, gaStates, countries, flights, visits, onGaFilterChange }: MemberDetailFilterProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<{ type: FilterType; value: string } | null>(null);
  const [gaOnly, setGaOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFlights, setSelectedFlights] = useState<Set<string>>(new Set());
  const [selectedVisits, setSelectedVisits] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const toggleFilter = (type: FilterType, value: string) => {
    if (filter?.type === type && filter?.value === value) {
      setFilter(null);
    } else {
      setFilter({ type, value });
    }
    // Reset selection when filter changes
    setSelectedFlights(new Set());
    setSelectedVisits(new Set());
  };

  const filteredFlights = useMemo(() => {
    if (!filter) return flights.slice(0, 10);
    return flights.filter((f) => {
      if (filter.type === "state") return f._states.includes(filter.value);
      return f._countries.includes(filter.value);
    });
  }, [flights, filter]);

  const filteredVisits = useMemo(() => {
    if (!filter) return visits.slice(0, 10);
    return visits.filter((v) => {
      if (filter.type === "state") return v.state === filter.value;
      return v.country === filter.value;
    });
  }, [visits, filter]);

  const toggleFlightSelection = (id: string) => {
    setSelectedFlights((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisitSelection = (id: string) => {
    setSelectedVisits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFlights = () => {
    setSelectedFlights(new Set(filteredFlights.map((f) => f.id)));
  };

  const selectAllVisits = () => {
    setSelectedVisits(new Set(filteredVisits.map((v) => v.id)));
  };

  const clearSelection = () => {
    setSelectedFlights(new Set());
    setSelectedVisits(new Set());
  };

  const totalSelected = selectedFlights.size + selectedVisits.size;

  const handleBulkDelete = () => {
    startTransition(async () => {
      if (selectedFlights.size > 0) {
        await bulkDeleteFlights(Array.from(selectedFlights));
      }
      if (selectedVisits.size > 0) {
        await bulkDeleteVisits(Array.from(selectedVisits));
      }
      setSelectedFlights(new Set());
      setSelectedVisits(new Set());
      setSelectMode(false);
      router.refresh();
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  return (
    <>
      {/* State & Country Pills */}
      <div className="grid gap-6 md:grid-cols-2">
        {states.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-semibold">
                States Visited ({(gaOnly ? gaStates : states).length})
              </h2>
              {gaStates.length > 0 && (
                <Badge
                  variant={gaOnly ? "default" : "secondary"}
                  className="text-xs cursor-pointer transition-colors"
                  onClick={() => { const next = !gaOnly; setGaOnly(next); onGaFilterChange?.(next); }}
                >
                  GA Only
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(gaOnly ? gaStates : states).map((s) => (
                <Badge
                  key={s}
                  variant={filter?.type === "state" && filter.value === s ? "default" : "secondary"}
                  className="text-xs cursor-pointer transition-colors"
                  onClick={() => toggleFilter("state", s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {countries.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Countries Visited ({countries.length})
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {countries.map((c) => (
                <Badge
                  key={c}
                  variant={filter?.type === "country" && filter.value === c ? "default" : "secondary"}
                  className="text-xs cursor-pointer transition-colors"
                  onClick={() => toggleFilter("country", c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar + Select Mode Toggle */}
      {filter && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Filtered by {filter.type}: <span className="font-medium text-foreground">{filter.value}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setFilter(null); exitSelectMode(); }} className="h-6 px-2 text-xs">
              Clear
            </Button>
          </div>
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">{totalSelected} selected</span>
          <div className="flex gap-2">
            {filteredFlights.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllFlights}>
                All flights ({filteredFlights.length})
              </Button>
            )}
            {filteredVisits.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllVisits}>
                All visits ({filteredVisits.length})
              </Button>
            )}
            {totalSelected > 0 && (
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Deselect
              </Button>
            )}
          </div>
          {totalSelected > 0 && (
            <ConfirmDialog
              title="Delete Selected"
              description={`Are you sure you want to delete ${selectedFlights.size > 0 ? `${selectedFlights.size} flight(s)` : ""}${selectedFlights.size > 0 && selectedVisits.size > 0 ? " and " : ""}${selectedVisits.size > 0 ? `${selectedVisits.size} visit(s)` : ""}? This cannot be undone.`}
              onConfirm={handleBulkDelete}
              trigger={
                <Button variant="destructive" size="sm" disabled={isPending}>
                  {isPending ? "Deleting..." : `Delete ${totalSelected}`}
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Flights */}
      {filteredFlights.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            {filter ? "Flights" : "Recent Flights"} ({filteredFlights.length})
          </h2>
          <div className="space-y-2">
            {filteredFlights.map((flight) => (
              <div key={flight.id} className="flex items-center gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedFlights.has(flight.id)}
                    onChange={() => toggleFlightSelection(flight.id)}
                    className="h-4 w-4 shrink-0 rounded border-border"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <FlightCard flight={flight} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visits */}
      {filteredVisits.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            {filter ? "Visits" : "Recent Visits"} ({filteredVisits.length})
          </h2>
          <div className="space-y-2">
            {filteredVisits.map((visit) => (
              <div key={visit.id} className="flex items-center gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedVisits.has(visit.id)}
                    onChange={() => toggleVisitSelection(visit.id)}
                    className="h-4 w-4 shrink-0 rounded border-border"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <VisitCard visit={visit} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filter && filteredFlights.length === 0 && filteredVisits.length === 0 && (
        <p className="text-sm text-muted-foreground">No flights or visits found for {filter.value}.</p>
      )}
    </>
  );
}
