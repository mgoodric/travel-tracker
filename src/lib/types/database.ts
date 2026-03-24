export type FlightCategory = "commercial" | "general_aviation";
export type PassengerRole = "passenger" | "pilot" | "copilot";
export type SeatType = "window" | "middle" | "aisle";
export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type FlightReason = "business" | "leisure";

export interface Airport {
  id: number;
  ident: string;
  iata_code: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
  type: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string;
}

export interface FamilyMember {
  id: string;
  user_id: string;
  name: string;
  relationship: string;
  created_at: string;
  updated_at: string;
}

export interface Flight {
  id: string;
  user_id: string;
  category: FlightCategory;
  airline: string | null;
  flight_number: string | null;
  aircraft_type: string | null;
  tail_number: string | null;
  departure_airport_id: number;
  arrival_airport_id: number;
  departure_date: string;
  distance_miles: number | null;
  notes: string | null;
  seat: string | null;
  seat_type: SeatType | null;
  cabin_class: CabinClass | null;
  flight_reason: FlightReason | null;
  booking_reference: string | null;
  departure_terminal: string | null;
  departure_gate: string | null;
  arrival_terminal: string | null;
  arrival_gate: string | null;
  scheduled_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlightWithAirports extends Flight {
  departure_airport: Airport;
  arrival_airport: Airport;
  passengers: FlightPassengerWithMember[];
}

export interface FlightPassenger {
  flight_id: string;
  family_member_id: string;
  role: PassengerRole;
}

export interface FlightPassengerWithMember extends FlightPassenger {
  family_member: FamilyMember;
}

export interface Visit {
  id: string;
  user_id: string;
  visit_date: string | null;
  city: string | null;
  state: string | null;
  country: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface VisitWithMembers extends Visit {
  members: FamilyMember[];
}

export interface VisitMember {
  visit_id: string;
  family_member_id: string;
}

export interface MemberStats {
  family_member_id: string;
  member_name: string;
  flight_count: number;
  total_miles: number;
  unique_countries: number;
  unique_states: number;
  unique_cities: number;
  unique_airports: number;
}

