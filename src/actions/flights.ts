"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sql, { transaction } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { haversineMiles } from "@/lib/haversine";

export async function createFlight(formData: FormData) {
  const userId = await getUserId();

  const category = formData.get("category") as "commercial" | "general_aviation";
  const departureAirportId = parseInt(formData.get("departure_airport_id") as string);
  const arrivalAirportId = parseInt(formData.get("arrival_airport_id") as string);
  const departureDate = formData.get("departure_date") as string;
  const notes = formData.get("notes") as string || null;

  // Fetch airports for distance calculation
  const airports = await sql`
    SELECT id, latitude, longitude FROM airports WHERE id IN (${departureAirportId}, ${arrivalAirportId})
  `;

  let distanceMiles: number | null = null;
  if (airports.length === 2) {
    const dep = airports.find(a => a.id === departureAirportId)!;
    const arr = airports.find(a => a.id === arrivalAirportId)!;
    distanceMiles = haversineMiles(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
  }

  const airline = category === "commercial" ? formData.get("airline") as string : null;
  const flightNumber = category === "commercial" ? formData.get("flight_number") as string : null;
  const seat = category === "commercial" ? (formData.get("seat") as string || null) : null;
  const cabinClass = category === "commercial" ? (formData.get("cabin_class") as string || null) : null;
  const flightReason = category === "commercial" ? (formData.get("flight_reason") as string || null) : null;
  const bookingReference = category === "commercial" ? (formData.get("booking_reference") as string || null) : null;
  const aircraftType = category === "general_aviation" ? (formData.get("aircraft_type") as string || null) : null;
  const tailNumber = category === "general_aviation" ? (formData.get("tail_number") as string || null) : null;

  await transaction(async (tx) => {
    const [flight] = await tx`
      INSERT INTO flights (
        user_id, category, departure_airport_id, arrival_airport_id, departure_date,
        distance_miles, notes, airline, flight_number, seat, cabin_class,
        flight_reason, booking_reference, aircraft_type, tail_number
      ) VALUES (
        ${userId}, ${category}, ${departureAirportId}, ${arrivalAirportId}, ${departureDate},
        ${distanceMiles}, ${notes}, ${airline}, ${flightNumber}, ${seat}, ${cabinClass},
        ${flightReason}, ${bookingReference}, ${aircraftType}, ${tailNumber}
      ) RETURNING id
    `;

    const passengersJson = formData.get("passengers") as string;
    if (passengersJson) {
      const passengers = JSON.parse(passengersJson) as { family_member_id: string; role: string }[];
      if (passengers.length > 0) {
        await tx`
          INSERT INTO flight_passengers ${tx(
            passengers.map(p => ({
              flight_id: flight.id,
              family_member_id: p.family_member_id,
              role: p.role,
            }))
          )}
        `;
      }
    }
  });

  revalidatePath("/flights");
  redirect("/flights");
}

export async function updateFlight(id: string, formData: FormData) {
  await getUserId();

  const category = formData.get("category") as "commercial" | "general_aviation";
  const departureAirportId = parseInt(formData.get("departure_airport_id") as string);
  const arrivalAirportId = parseInt(formData.get("arrival_airport_id") as string);
  const departureDate = formData.get("departure_date") as string;
  const notes = formData.get("notes") as string || null;

  const airports = await sql`
    SELECT id, latitude, longitude FROM airports WHERE id IN (${departureAirportId}, ${arrivalAirportId})
  `;

  let distanceMiles: number | null = null;
  if (airports.length === 2) {
    const dep = airports.find(a => a.id === departureAirportId)!;
    const arr = airports.find(a => a.id === arrivalAirportId)!;
    distanceMiles = haversineMiles(dep.latitude, dep.longitude, arr.latitude, arr.longitude);
  }

  await transaction(async (tx) => {
    await tx`
      UPDATE flights SET
        category = ${category},
        departure_airport_id = ${departureAirportId},
        arrival_airport_id = ${arrivalAirportId},
        departure_date = ${departureDate},
        distance_miles = ${distanceMiles},
        notes = ${notes},
        airline = ${category === "commercial" ? (formData.get("airline") as string) : null},
        flight_number = ${category === "commercial" ? (formData.get("flight_number") as string) : null},
        seat = ${category === "commercial" ? (formData.get("seat") as string || null) : null},
        cabin_class = ${category === "commercial" ? (formData.get("cabin_class") as string || null) : null},
        flight_reason = ${category === "commercial" ? (formData.get("flight_reason") as string || null) : null},
        booking_reference = ${category === "commercial" ? (formData.get("booking_reference") as string || null) : null},
        aircraft_type = ${category === "general_aviation" ? (formData.get("aircraft_type") as string) : null},
        tail_number = ${category === "general_aviation" ? (formData.get("tail_number") as string) : null},
        updated_at = now()
      WHERE id = ${id}
    `;

    // Replace passengers
    await tx`DELETE FROM flight_passengers WHERE flight_id = ${id}`;
    const passengersJson = formData.get("passengers") as string;
    if (passengersJson) {
      const passengers = JSON.parse(passengersJson) as { family_member_id: string; role: string }[];
      if (passengers.length > 0) {
        await tx`
          INSERT INTO flight_passengers ${tx(
            passengers.map(p => ({
              flight_id: id,
              family_member_id: p.family_member_id,
              role: p.role,
            }))
          )}
        `;
      }
    }
  });

  revalidatePath("/flights");
  redirect("/flights");
}

export async function deleteFlight(id: string) {
  const userId = await getUserId();
  await sql`DELETE FROM flights WHERE id = ${id} AND user_id = ${userId}`;
  revalidatePath("/flights");
  redirect("/flights");
}

export async function bulkDeleteFlights(ids: string[]) {
  const userId = await getUserId();
  if (ids.length === 0) return;
  await sql`DELETE FROM flights WHERE id = ANY(${ids}) AND user_id = ${userId}`;
  revalidatePath("/flights");
  revalidatePath("/family");
}
