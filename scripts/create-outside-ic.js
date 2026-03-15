// One-time script: creates an "Outside Cardiologist" placeholder physician
// for IC call rotation. Run with: node scripts/create-outside-ic.js

const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const DATABASE_URL =
  "postgresql://neondb_owner:npg_On4DFJNU6QMu@ep-snowy-river-an00c9sp-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const client = new Client(DATABASE_URL);
  await client.connect();

  try {
    // Check if already exists (physician linked to outside.ic email)
    const existing = await client.query(
      `SELECT p.id FROM "Physician" p JOIN "User" u ON p."userId" = u.id
       WHERE u.email = 'outside.ic@cardiopractice.com'`
    );
    if (existing.rows.length > 0) {
      console.log("Outside Cardiologist already exists, skipping.");
      await client.end();
      return;
    }

    // Clean up any orphaned User from a previous failed attempt
    await client.query(
      `DELETE FROM "User" WHERE email = 'outside.ic@cardiopractice.com'`
    );

    // Create User
    const passwordHash = await bcrypt.hash("outside123", 12);
    const userRes = await client.query(
      `INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, 'outside.ic@cardiopractice.com', $1, 'PHYSICIAN', NOW(), NOW())
       RETURNING id`,
      [passwordHash]
    );
    const userId = userRes.rows[0].id;
    console.log("Created User:", userId);

    // Create Physician
    const physRes = await client.query(
      `INSERT INTO "Physician" (id, "userId", "firstName", "lastName", "fteDays", "isInterventionalist", "isEP", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Outside', 'Cardiologist', 0, true, false, NOW(), NOW())
       RETURNING id`,
      [userId]
    );
    const physicianId = physRes.rows[0].id;
    console.log("Created Physician:", physicianId);

    // Find INTERVENTIONAL_CALL role type
    const roleRes = await client.query(
      `SELECT id FROM "RoleType" WHERE name = 'INTERVENTIONAL_CALL'`
    );
    if (roleRes.rows.length === 0) {
      console.error("ERROR: INTERVENTIONAL_CALL role type not found!");
      await client.end();
      return;
    }
    const roleTypeId = roleRes.rows[0].id;

    // Create eligibility for INTERVENTIONAL_CALL only
    await client.query(
      `INSERT INTO "PhysicianEligibility" (id, "physicianId", "roleTypeId")
       VALUES (gen_random_uuid()::text, $1, $2)`,
      [physicianId, roleTypeId]
    );
    console.log("Created eligibility for INTERVENTIONAL_CALL");

    console.log("\nDone! Outside Cardiologist is now in the IC rotation.");
    console.log("Regenerate the schedule to see the updated distribution.");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

main();
