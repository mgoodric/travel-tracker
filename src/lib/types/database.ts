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

// Supabase Database type for typed client
export interface Database {
  public: {
    Tables: {
      airports: {
        Row: Airport;
        Insert: Omit<Airport, "id">;
        Update: Partial<Omit<Airport, "id">>;
        Relationships: [];
      };
      family_members: {
        Row: FamilyMember;
        Insert: Omit<FamilyMember, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<FamilyMember, "id" | "created_at">>;
        Relationships: [];
      };
      flights: {
        Row: Flight;
        Insert: Omit<Flight, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Flight, "id" | "created_at">>;
        Relationships: [
          {
            foreignKeyName: "flights_departure_airport_id_fkey";
            columns: ["departure_airport_id"];
            isOneToOne: false;
            referencedRelation: "airports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flights_arrival_airport_id_fkey";
            columns: ["arrival_airport_id"];
            isOneToOne: false;
            referencedRelation: "airports";
            referencedColumns: ["id"];
          }
        ];
      };
      flight_passengers: {
        Row: FlightPassenger;
        Insert: FlightPassenger;
        Update: Partial<FlightPassenger>;
        Relationships: [
          {
            foreignKeyName: "flight_passengers_flight_id_fkey";
            columns: ["flight_id"];
            isOneToOne: false;
            referencedRelation: "flights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flight_passengers_family_member_id_fkey";
            columns: ["family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          }
        ];
      };
      visits: {
        Row: Visit;
        Insert: Omit<Visit, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Visit, "id" | "created_at">>;
        Relationships: [];
      };
      visit_members: {
        Row: VisitMember;
        Insert: VisitMember;
        Update: Partial<VisitMember>;
        Relationships: [
          {
            foreignKeyName: "visit_members_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_members_family_member_id_fkey";
            columns: ["family_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      member_stats: {
        Row: MemberStats;
        Relationships: [];
      };
    };
    Functions: {
      haversine_miles: {
        Args: {
          lat1: number;
          lon1: number;
          lat2: number;
          lon2: number;
        };
        Returns: number;
      };
    };
    Enums: {
      flight_category: FlightCategory;
      passenger_role: PassengerRole;
      seat_type: SeatType;
      cabin_class: CabinClass;
      flight_reason: FlightReason;
    };
  };
}
