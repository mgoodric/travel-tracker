/**
 * Infer visits from flight data for all family members.
 *
 * Logic: If a member flew TO a city and then flew out 1+ days later,
 * that's a visit to the arrival city.
 *
 * Usage: npx tsx scripts/infer-visits-from-flights.ts [--dry-run] [--min-gap-days=1]
 */

import { createClient } from "@supabase/supabase-js";

// ISO-2 country code to country name
const ISO2_TO_COUNTRY: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", GB: "United Kingdom",
  IE: "Ireland", FR: "France", DE: "Germany", IT: "Italy", ES: "Spain",
  NL: "Netherlands", BE: "Belgium", CH: "Switzerland", AT: "Austria",
  JP: "Japan", KR: "South Korea", CN: "China", TW: "Taiwan", SG: "Singapore",
  TH: "Thailand", MY: "Malaysia", ID: "Indonesia", PH: "Philippines",
  IN: "India", AU: "Australia", NZ: "New Zealand", BR: "Brazil",
  AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
  IS: "Iceland", NO: "Norway", SE: "Sweden", DK: "Denmark", FI: "Finland",
  PT: "Portugal", GR: "Greece", TR: "Turkey", IL: "Israel", AE: "United Arab Emirates",
  SA: "Saudi Arabia", EG: "Egypt", ZA: "South Africa", KE: "Kenya",
  CR: "Costa Rica", PA: "Panama", CU: "Cuba", JM: "Jamaica",
  DO: "Dominican Republic", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
  BS: "Bahamas", BB: "Barbados", TT: "Trinidad and Tobago",
  HK: "Hong Kong", MO: "Macau", VN: "Vietnam", KH: "Cambodia",
  LA: "Laos", MM: "Myanmar", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  PK: "Pakistan", QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman",
  RU: "Russia", UA: "Ukraine", PL: "Poland", CZ: "Czech Republic",
  HU: "Hungary", RO: "Romania", BG: "Bulgaria", HR: "Croatia",
  SK: "Slovakia", SI: "Slovenia", RS: "Serbia", BA: "Bosnia and Herzegovina",
  ME: "Montenegro", MK: "North Macedonia", AL: "Albania", XK: "Kosovo",
  LT: "Lithuania", LV: "Latvia", EE: "Estonia",
  LU: "Luxembourg", MT: "Malta", CY: "Cyprus",
  UY: "Uruguay", PY: "Paraguay", EC: "Ecuador", BO: "Bolivia",
  VE: "Venezuela", GY: "Guyana", SR: "Suriname",
  FJ: "Fiji", WS: "Samoa", TO: "Tonga", PG: "Papua New Guinea",
};

// US state abbreviation from iso_region like "US-WA" -> "Washington"
const US_STATE_ABBREVS: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

interface MemberFlight {
  departure_date: string;
  arrival_airport: {
    iata_code: string | null;
    municipality: string | null;
    iso_region: string;
    iso_country: string;
    latitude: number;
    longitude: number;
  };
  departure_airport: {
    iata_code: string | null;
    municipality: string | null;
    iso_region: string;
    iso_country: string;
  };
}

interface InferredVisit {
  date: string;
  city: string;
  state: string | null;
  country: string;
  lat: number;
  lng: number;
  memberName: string;
  memberId: string;
  arrivalCode: string;
  departureCode: string;
  stayDays: number;
}

// Birth date cutoffs — no visits before these dates
const MEMBER_CUTOFFS: Record<string, string> = {
  sullivan: "2018-06-01",
  collins: "2021-05-01",
};

function airportToLocation(airport: MemberFlight["arrival_airport"]): {
  city: string;
  state: string | null;
  country: string;
} {
  const country = ISO2_TO_COUNTRY[airport.iso_country] || airport.iso_country;
  const city = airport.municipality || airport.iata_code || "Unknown";

  let state: string | null = null;
  if (airport.iso_country === "US" && airport.iso_region) {
    const abbr = airport.iso_region.split("-")[1];
    state = US_STATE_ABBREVS[abbr] || null;
  }

  return { city, state, country };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const minGapArg = args.find((a) => a.startsWith("--min-gap-days="));
  const minGapDays = minGapArg ? parseInt(minGapArg.split("=")[1]) : 1;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all family members
  const { data: members } = await supabase.from("family_members").select("id, name");
  if (!members || members.length === 0) {
    console.error("No family members found");
    process.exit(1);
  }

  // Get user_id
  const { data: sampleFlight } = await supabase.from("flights").select("user_id").limit(1).single();
  if (!sampleFlight) { console.error("No flights found"); process.exit(1); }
  const userId = sampleFlight.user_id;

  // Get existing visits for dedup
  const { data: existingVisits } = await supabase
    .from("visits")
    .select("visit_date, city, state, country");

  const existingSet = new Set(
    (existingVisits ?? []).map((v) =>
      `${v.visit_date}|${(v.city || "").toLowerCase()}|${(v.state || "").toLowerCase()}|${v.country.toLowerCase()}`
    )
  );

  // Get existing visit_members for dedup
  const { data: existingVMs } = await supabase
    .from("visit_members")
    .select("visit_id, family_member_id");
  const existingVMSet = new Set(
    (existingVMs ?? []).map((vm) => `${vm.visit_id}|${vm.family_member_id}`)
  );

  const allInferred: InferredVisit[] = [];

  for (const member of members) {
    const cutoff = MEMBER_CUTOFFS[member.name.toLowerCase()] || null;
    console.log(`\nProcessing ${member.name}${cutoff ? ` (born ${cutoff})` : ""}...`);

    // Fetch flights via join through flight_passengers (avoids .in() URL limit)
    const { data: rows, error } = await supabase
      .from("flight_passengers")
      .select(`
        flight:flights(
          departure_date,
          arrival_airport:airports!arrival_airport_id(iata_code, municipality, iso_region, iso_country, latitude, longitude),
          departure_airport:airports!departure_airport_id(iata_code, municipality, iso_region, iso_country)
        )
      `)
      .eq("family_member_id", member.id);

    if (error) {
      console.error(`  Error fetching flights: ${error.message}`);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flights: MemberFlight[] = (rows ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => r.flight)
      .filter(Boolean)
      .sort((a: MemberFlight, b: MemberFlight) => a.departure_date.localeCompare(b.departure_date));

    console.log(`  ${flights.length} flights`);

    // For each consecutive pair: arrival of flight N -> departure of flight N+1
    // If gap >= minGapDays, infer a visit at the arrival city of flight N
    for (let i = 0; i < flights.length - 1; i++) {
      const arriving = flights[i];
      const departing = flights[i + 1];

      const arrDate = new Date(arriving.departure_date);
      const depDate = new Date(departing.departure_date);
      const gapDays = (depDate.getTime() - arrDate.getTime()) / (1000 * 60 * 60 * 24);

      if (gapDays < minGapDays) continue;

      // Apply birth cutoff
      if (cutoff && arriving.departure_date < cutoff) continue;

      const loc = airportToLocation(arriving.arrival_airport);
      const arrCode = arriving.arrival_airport.iata_code || "???";
      const depCode = departing.departure_airport.iata_code || "???";

      allInferred.push({
        date: arriving.departure_date,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        lat: arriving.arrival_airport.latitude,
        lng: arriving.arrival_airport.longitude,
        memberName: member.name,
        memberId: member.id,
        arrivalCode: arrCode,
        departureCode: depCode,
        stayDays: Math.round(gapDays),
      });
    }
  }

  console.log(`\nTotal inferred visits: ${allInferred.length}`);

  if (dryRun) {
    console.log("\n=== DRY RUN ===\n");
    const byMember = new Map<string, InferredVisit[]>();
    for (const v of allInferred) {
      if (!byMember.has(v.memberName)) byMember.set(v.memberName, []);
      byMember.get(v.memberName)!.push(v);
    }
    for (const [name, visits] of byMember) {
      console.log(`\n--- ${name} (${visits.length} visits) ---`);
      for (const v of visits.sort((a, b) => a.date.localeCompare(b.date))) {
        const loc = [v.city, v.state, v.country].filter(Boolean).join(", ");
        console.log(`  ${v.date}  ${loc}  (${v.stayDays}d, ${v.arrivalCode}->${v.departureCode})`);
      }
    }
    return;
  }

  // Import: for each inferred visit, either create new or add member to existing
  let created = 0;
  let membersAdded = 0;
  let skipped = 0;
  let errors = 0;

  for (const v of allInferred) {
    const dedupKey = `${v.date}|${v.city.toLowerCase()}|${(v.state || "").toLowerCase()}|${v.country.toLowerCase()}`;

    // Check if this visit already exists in DB
    const { data: existing } = await supabase
      .from("visits")
      .select("id")
      .eq("visit_date", v.date)
      .ilike("city", v.city)
      .eq("country", v.country)
      .limit(1);

    let visitId: string;

    if (existing && existing.length > 0) {
      visitId = existing[0].id;
    } else {
      // Create the visit
      const { data: newVisit, error } = await supabase
        .from("visits")
        .insert({
          user_id: userId,
          visit_date: v.date,
          city: v.city,
          state: v.state,
          country: v.country,
          notes: null,
          latitude: v.lat,
          longitude: v.lng,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`  Error creating visit ${v.city}: ${error.message}`);
        errors++;
        continue;
      }
      visitId = newVisit.id;
      created++;
    }

    // Add member to visit if not already linked
    const vmKey = `${visitId}|${v.memberId}`;
    if (!existingVMSet.has(vmKey)) {
      const { error: vmError } = await supabase
        .from("visit_members")
        .insert({ visit_id: visitId, family_member_id: v.memberId });

      if (vmError) {
        // Might be duplicate key - ignore
        if (!vmError.message.includes("duplicate")) {
          console.error(`  Error adding ${v.memberName} to visit: ${vmError.message}`);
        }
      } else {
        existingVMSet.add(vmKey);
        membersAdded++;
      }
    } else {
      skipped++;
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`New visits created: ${created}`);
  console.log(`Member-visit links added: ${membersAdded}`);
  console.log(`Skipped (already linked): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
