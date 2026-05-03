// Syncs production users/physicians into the local dev database.
// Run with: node scripts/sync-prod-users.js

const { Client } = require("pg");

const LOCAL_DB = "postgresql://ianchristoph@localhost/cardioschedule";

const PROD_HASH = "$2b$12$YkRVg780FzRLPMSxFcmY2OPvxB.mpTMH2qK8XsSUgMUvqXDhuzhAy";

const users = [
  {
    email: "admin@sutterhealth.org",
    role: "ADMIN",
    physician: { firstName: "Admin", lastName: "User", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "Ian.Christoph@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Ian", lastName: "Christoph", phone: "(650) 219-1341", fteDays: 150, isInterventionalist: false, isEP: false },
  },
  {
    email: "Brad.Angeja@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Brad", lastName: "Angeja", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "outside.ic@cardiopractice.com",
    role: "PHYSICIAN",
    physician: { firstName: "Outside", lastName: "Cardiologist", fteDays: 0, isInterventionalist: true, isEP: false },
  },
  {
    email: "Mahazarin.Ginwalla@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Mahazarin", lastName: "Ginwalla", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "Elliott.Groves@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Elliott", lastName: "Groves", fteDays: 200, isInterventionalist: true, isEP: false },
  },
  {
    email: "Leila.Haghighat@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Leila", lastName: "Haghighat", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "Samuel.Jackson@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Samuel", lastName: "Jackson", fteDays: 200, isInterventionalist: true, isEP: false },
  },
  {
    email: "Tania.Nanevicz@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Tania", lastName: "Nanevicz", fteDays: 155, isInterventionalist: false, isEP: false },
  },
  {
    email: "Ning.Ning@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Ning", lastName: "Ning", fteDays: 200, isInterventionalist: true, isEP: false },
  },
  {
    email: "Kavisha.Patel@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Kavisha", lastName: "Patel", fteDays: 200, isInterventionalist: false, isEP: true },
  },
  {
    email: "Amir.Schricker@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Amir", lastName: "Schricker", fteDays: 200, isInterventionalist: false, isEP: true },
  },
  {
    email: "Sonia.Shah@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Sonia", lastName: "Shah", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "Anjali.Thakkar@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Anjali", lastName: "Thakkar", fteDays: 200, isInterventionalist: false, isEP: false },
  },
  {
    email: "Sithu.Win@Sutterhealth.org",
    role: "PHYSICIAN",
    physician: { firstName: "Sithu", lastName: "Win", fteDays: 200, isInterventionalist: false, isEP: false },
  },
];

async function main() {
  const db = new Client({ connectionString: LOCAL_DB });
  await db.connect();

  for (const { email, role, physician } of users) {
    // Upsert user
    const userRes = await db.query(
      `INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
         SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role, "updatedAt" = NOW()
       RETURNING id`,
      [email, PROD_HASH, role]
    );
    const userId = userRes.rows[0].id;

    if (physician) {
      const { firstName, lastName, phone = null, fteDays, isInterventionalist, isEP } = physician;
      await db.query(
        `INSERT INTO "Physician" (id, "userId", "firstName", "lastName", phone, "fteDays", "isInterventionalist", "isEP", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT ("userId") DO UPDATE
           SET "firstName" = EXCLUDED."firstName",
               "lastName"  = EXCLUDED."lastName",
               phone       = EXCLUDED.phone,
               "fteDays"   = EXCLUDED."fteDays",
               "isInterventionalist" = EXCLUDED."isInterventionalist",
               "isEP"      = EXCLUDED."isEP",
               "updatedAt" = NOW()`,
        [userId, firstName, lastName, phone, fteDays, isInterventionalist, isEP]
      );
    }

    console.log(`✓ ${email}`);
  }

  await db.end();
  console.log("\nDone. All production users synced to local DB.");
}

main().catch((err) => { console.error(err); process.exit(1); });
