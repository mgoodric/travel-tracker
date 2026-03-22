"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { haversineMiles } from "@/lib/haversine";

export async function createFlight(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const category = formData.get("category") as "commercial" | "general_aviation";
  const departureAirportId = parseInt(formData.get("departure_airport_id") as string);
  const arrivalAirportId = parseInt(formData.get("arrival_airport_id") as string);
  const departureDate = formData.get("departure_date") as string;
  const notes = formData.get("notes") as string || null;

  // Fetch airports for distance calculation
  const { data: airports } = await supabase
    .from("airports")
    .select("id, latitude, longitude")
    .in("id", [departureAirportId, arrivalAirportId]);

  let distanceMiles: number | null = null;
  if (airports && airports.length === 2) {
    const dep = airports.find(a => a.id === departureAirportId)!;
    const arr = airports.find(a => a.id === arrivalAirportId)!;
    distanceMiles = haversineMiles(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
  }

  const flightData: Record<string, unknown> = {
    user_id: user.id,
    category,
    departure_airport_id: departureAirportId,
    arrival_airport_id: arrivalAirportId,
    departure_date: departureDate,
    distance_miles: distanceMiles,
    notes,
  };

  if (category === "commercial") {
    flightData.airline = formData.get("airline") as string;
    flightData.flight_number = formData.get("flight_number") as string;
    flightData.seat = formData.get("seat") as string || null;
    flightData.cabin_class = formData.get("cabin_class") as string || null;
    flightData.flight_reason = formData.get("flight_reason") as string || null;
    flightData.booking_reference = formData.get("booking_reference") as string || null;
  } else {
    flightData.aircraft_type = formData.get("aircraft_type") as string || null;
    flightData.tail_number = formData.get("tail_number") as string || null;
  }

  const { data: flight, error } = await supabase
    .from("flights")
    .insert(flightData)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Insert passengers
  const passengersJson = formData.get("passengers") as string;
  if (passengersJson) {
    const passengers = JSON.parse(passengersJson) as { family_member_id: string; role: string }[];
    if (passengers.length > 0) {
      const { error: pError } = await supabase.from("flight_passengers").insert(
        passengers.map(p => ({
          flight_id: flight.id,
          family_member_id: p.family_member_id,
          role: p.role as "passenger" | "pilot" | "copilot",
        }))
      );
      if (pError) throw new Error(pError.message);
    }
  }

  revalidatePath("/flights");
  redirect("/flights");
}

export async function updateFlight(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const category = formData.get("category") as "commercial" | "general_aviation";
  const departureAirportId = parseInt(formData.get("departure_airport_id") as string);
  const arrivalAirportId = parseInt(formData.get("arrival_airport_id") as string);
  const departureDate = formData.get("departure_date") as string;
  const notes = formData.get("notes") as string || null;

  const { data: airports } = await supabase
    .from("airports")
    .select("id, latitude, longitude")
    .in("id", [departureAirportId, arrivalAirportId]);

  let distanceMiles: number | null = null;
  if (airports && airports.length === 2) {
    const dep = airports.find(a => a.id === departureAirportId)!;
    const arr = airports.find(a => a.id === arrivalAirportId)!;
    distanceMiles = haversineMiles(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
  }

  const flightData: Record<string, unknown> = {
    category,
    departure_airport_id: departureAirportId,
    arrival_airport_id: arrivalAirportId,
    departure_date: departureDate,
    distance_miles: distanceMiles,
    notes,
    updated_at: new Date().toISOString(),
    airline: category === "commercial" ? formData.get("airline") : null,
    flight_number: category === "commercial" ? formData.get("flight_number") : null,
    seat: category === "commercial" ? (formData.get("seat") as string || null) : null,
    cabin_class: category === "commercial" ? (formData.get("cabin_class") as string || null) : null,
    flight_reason: category === "commercial" ? (formData.get("flight_reason") as string || null) : null,
    booking_reference: category === "commercial" ? (formData.get("booking_reference") as string || null) : null,
    aircraft_type: category === "general_aviation" ? formData.get("aircraft_type") : null,
    tail_number: category === "general_aviation" ? formData.get("tail_number") : null,
  };

  const { error } = await supabase.from("flights").update(flightData).eq("id", id);
  if (error) throw new Error(error.message);

  // Replace passengers
  await supabase.from("flight_passengers").delete().eq("flight_id", id);
  const passengersJson = formData.get("passengers") as string;
  if (passengersJson) {
    const passengers = JSON.parse(passengersJson) as { family_member_id: string; role: string }[];
    if (passengers.length > 0) {
      await supabase.from("flight_passengers").insert(
        passengers.map(p => ({
          flight_id: id,
          family_member_id: p.family_member_id,
          role: p.role as "passenger" | "pilot" | "copilot",
        }))
      );
    }
  }

  revalidatePath("/flights");
  redirect("/flights");
}

export async function deleteFlight(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("flights").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/flights");
  redirect("/flights");
}

export async function bulkDeleteFlights(ids: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (ids.length === 0) return;

  const { error } = await supabase.from("flights").delete().in("id", ids);
  if (error) throw new Error(error.message);

  revalidatePath("/flights");
  revalidatePath("/family");
}
