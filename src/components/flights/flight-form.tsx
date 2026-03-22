"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { AirportCombobox } from "@/components/airports/airport-combobox";
import { PassengerSelect } from "@/components/flights/passenger-select";
import { haversineMiles } from "@/lib/haversine";
import type { Airport, FamilyMember, FlightCategory, CabinClass, FlightReason } from "@/lib/types/database";

interface FlightFormProps {
  flight?: {
    id: string;
    category: FlightCategory;
    airline: string | null;
    flight_number: string | null;
    aircraft_type: string | null;
    tail_number: string | null;
    departure_airport: Airport;
    arrival_airport: Airport;
    departure_date: string;
    notes: string | null;
    seat: string | null;
    cabin_class: CabinClass | null;
    flight_reason: FlightReason | null;
    booking_reference: string | null;
    flight_passengers?: { family_member_id: string; role: string }[];
  };
  familyMembers: FamilyMember[];
  action: (formData: FormData) => Promise<void>;
}

export function FlightForm({ flight, familyMembers, action }: FlightFormProps) {
  const [category, setCategory] = useState<FlightCategory>(flight?.category || "commercial");
  const [departureAirport, setDepartureAirport] = useState<Airport | null>(
    flight?.departure_airport || null
  );
  const [arrivalAirport, setArrivalAirport] = useState<Airport | null>(
    flight?.arrival_airport || null
  );
  const [passengers, setPassengers] = useState<{ family_member_id: string; role: string }[]>(
    flight?.flight_passengers || []
  );

  const distance =
    departureAirport && arrivalAirport
      ? haversineMiles(
          departureAirport.latitude,
          departureAirport.longitude,
          arrivalAirport.latitude,
          arrivalAirport.longitude
        )
      : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-6">
          {/* Category Toggle */}
          <div className="space-y-2">
            <Label>Flight Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={category === "commercial" ? "default" : "outline"}
                onClick={() => setCategory("commercial")}
              >
                Commercial
              </Button>
              <Button
                type="button"
                variant={category === "general_aviation" ? "default" : "outline"}
                onClick={() => setCategory("general_aviation")}
              >
                General Aviation
              </Button>
            </div>
            <input type="hidden" name="category" value={category} />
          </div>

          {/* Commercial Fields */}
          {category === "commercial" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="airline">Airline</Label>
                  <Input
                    id="airline"
                    name="airline"
                    defaultValue={flight?.airline || ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flight_number">Flight Number</Label>
                  <Input
                    id="flight_number"
                    name="flight_number"
                    defaultValue={flight?.flight_number || ""}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="seat">Seat</Label>
                  <Input
                    id="seat"
                    name="seat"
                    placeholder="e.g. 12A"
                    defaultValue={flight?.seat || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cabin_class">Cabin Class</Label>
                  <select
                    id="cabin_class"
                    name="cabin_class"
                    defaultValue={flight?.cabin_class || ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select...</option>
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flight_reason">Reason</Label>
                  <select
                    id="flight_reason"
                    name="flight_reason"
                    defaultValue={flight?.flight_reason || ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select...</option>
                    <option value="business">Business</option>
                    <option value="leisure">Leisure</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking_reference">Booking Reference (PNR)</Label>
                <Input
                  id="booking_reference"
                  name="booking_reference"
                  placeholder="e.g. ABC123"
                  defaultValue={flight?.booking_reference || ""}
                />
              </div>
            </>
          )}

          {/* GA Fields */}
          {category === "general_aviation" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="aircraft_type">Aircraft Type</Label>
                <Input
                  id="aircraft_type"
                  name="aircraft_type"
                  defaultValue={flight?.aircraft_type || ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tail_number">Tail Number</Label>
                <Input
                  id="tail_number"
                  name="tail_number"
                  defaultValue={flight?.tail_number || ""}
                />
              </div>
            </div>
          )}

          {/* Airport Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Departure Airport</Label>
              <AirportCombobox
                value={departureAirport}
                onChange={setDepartureAirport}
                placeholder="Select departure..."
              />
              <input
                type="hidden"
                name="departure_airport_id"
                value={departureAirport?.id || ""}
              />
            </div>
            <div className="space-y-2">
              <Label>Arrival Airport</Label>
              <AirportCombobox
                value={arrivalAirport}
                onChange={setArrivalAirport}
                placeholder="Select arrival..."
              />
              <input
                type="hidden"
                name="arrival_airport_id"
                value={arrivalAirport?.id || ""}
              />
            </div>
          </div>

          {/* Distance Preview */}
          {distance !== null && (
            <p className="text-sm text-muted-foreground">
              Estimated distance: <strong>{distance.toLocaleString()} miles</strong>
            </p>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="departure_date">Departure Date</Label>
            <Input
              id="departure_date"
              name="departure_date"
              type="date"
              defaultValue={flight?.departure_date || ""}
              required
            />
          </div>

          {/* Passengers */}
          <div className="space-y-2">
            <Label>Passengers</Label>
            <PassengerSelect
              familyMembers={familyMembers}
              value={passengers}
              onChange={setPassengers}
            />
            <input type="hidden" name="passengers" value={JSON.stringify(passengers)} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={flight?.notes || ""}
            />
          </div>

          <Button type="submit" className="w-full">
            {flight ? "Update Flight" : "Log Flight"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
