import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const flights = await sql`
    SELECT f.departure_date, f.airline, f.flight_number,
      da.iata_code as dep_iata, da.name as dep_name, da.iso_country as dep_country,
      aa.iata_code as arr_iata, aa.name as arr_name, aa.iso_country as arr_country
    FROM flights f
    JOIN airports da ON da.id = f.departure_airport_id
    JOIN airports aa ON aa.id = f.arrival_airport_id
    WHERE da.iso_country IN ('BR', 'PE') OR aa.iso_country IN ('BR', 'PE')
    ORDER BY f.departure_date
  `;

  console.log("Flights touching Brazil/Peru:");
  for (const f of flights) {
    console.log(`  ${f.departure_date.toISOString().slice(0,10)}  ${f.airline || ""} ${f.flight_number || ""}  ${f.dep_iata} (${f.dep_country}) -> ${f.arr_iata} (${f.arr_country})`);
  }

  const visits = await sql`SELECT * FROM visits WHERE country IN ('Brazil', 'Peru', 'BR', 'PE')`;
  console.log(`\nVisit records for Brazil/Peru: ${visits.length}`);
  for (const v of visits) {
    console.log(`  ${v.visit_date} ${v.city}, ${v.country}`);
  }

  // Check member_stats view for who has these countries
  const stats = await sql`
    SELECT ms.member_name,
      (SELECT array_agg(DISTINCT country) FROM (
        SELECT dep.iso_country AS country
        FROM flight_passengers fp
        JOIN flights f ON f.id = fp.flight_id
        JOIN airports dep ON dep.id = f.departure_airport_id
        WHERE fp.family_member_id = ms.family_member_id
        UNION
        SELECT arr.iso_country
        FROM flight_passengers fp
        JOIN flights f ON f.id = fp.flight_id
        JOIN airports arr ON arr.id = f.arrival_airport_id
        WHERE fp.family_member_id = ms.family_member_id
        UNION
        SELECT v.country
        FROM visit_members vm
        JOIN visits v ON v.id = vm.visit_id
        WHERE vm.family_member_id = ms.family_member_id
      ) geo WHERE country IN ('BR', 'PE')) AS br_pe_countries
    FROM member_stats ms
    WHERE ms.unique_countries > 0
  `;
  console.log("\nMembers with BR/PE in their countries:");
  for (const s of stats) {
    if (s.br_pe_countries && s.br_pe_countries.length > 0) {
      console.log(`  ${s.member_name}: ${s.br_pe_countries}`);
    }
  }

  await sql.end();
}

main().catch(console.error);
