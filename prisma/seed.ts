import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // --- Role Types ---
  const roles = await Promise.all([
    prisma.roleType.upsert({
      where: { name: "GENERAL_CALL" },
      update: {},
      create: {
        name: "GENERAL_CALL",
        displayName: "General Call",
        category: "ON_CALL",
        description: "Overnight/after-hours general cardiology call",
        sortOrder: 1,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "INTERVENTIONAL_CALL" },
      update: {},
      create: {
        name: "INTERVENTIONAL_CALL",
        displayName: "Interventional Call",
        category: "ON_CALL",
        description: "Cath lab on-call coverage",
        sortOrder: 2,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "EP_CALL" },
      update: {},
      create: {
        name: "EP_CALL",
        displayName: "EP Call",
        category: "ON_CALL",
        description: "Electrophysiology on-call coverage",
        sortOrder: 3,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "HOSPITAL_ROUNDER" },
      update: {},
      create: {
        name: "HOSPITAL_ROUNDER",
        displayName: "Hospital Rounder",
        category: "DAYTIME",
        description: "Daytime hospital rounding physician",
        sortOrder: 4,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "ICU_ROUNDER" },
      update: {},
      create: {
        name: "ICU_ROUNDER",
        displayName: "ICU Rounder",
        category: "DAYTIME",
        description: "Daytime ICU rounding physician",
        sortOrder: 5,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "DOC_IN_BOX" },
      update: {},
      create: {
        name: "DOC_IN_BOX",
        displayName: "Doc in the Box",
        category: "DAYTIME",
        description: "Office physician handling ad-hoc issues",
        sortOrder: 6,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "ECHO_READER" },
      update: {},
      create: {
        name: "ECHO_READER",
        displayName: "Echo Reader",
        category: "READING",
        description: "Echocardiogram interpretation",
        sortOrder: 7,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "ECG_READER" },
      update: {},
      create: {
        name: "ECG_READER",
        displayName: "ECG Reader",
        category: "READING",
        description: "Electrocardiogram interpretation",
        sortOrder: 8,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "CT_FFR_READER" },
      update: {},
      create: {
        name: "CT_FFR_READER",
        displayName: "CT FFR Reader",
        category: "READING",
        description: "CT fractional flow reserve interpretation",
        sortOrder: 9,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "MPI_READER" },
      update: {},
      create: {
        name: "MPI_READER",
        displayName: "MPI Reader",
        category: "READING",
        description: "Myocardial perfusion imaging (nuclear stress) interpretation",
        sortOrder: 10,
      },
    }),
    prisma.roleType.upsert({
      where: { name: "CARDIOVERSION_TEE" },
      update: {},
      create: {
        name: "CARDIOVERSION_TEE",
        displayName: "Cardioversion / TEE",
        category: "SPECIAL",
        description: "Cardioversion and transesophageal echocardiography procedures",
        sortOrder: 11,
      },
    }),
  ]);

  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  // --- Scheduling Rules ---
  const rules = [
    {
      name: "Interventionalists excluded from echo reading",
      description: "Interventionalists cannot be assigned echo reading duties",
      ruleType: "EXCLUSION" as const,
      roleTypeId: roleMap.ECHO_READER,
      parameters: { excludeSubspecialty: "isInterventionalist" },
      priority: 10,
    },
    {
      name: "Echo reading requires office day",
      description: "Physician must have an office day on the scheduled date",
      ruleType: "PREREQUISITE" as const,
      roleTypeId: roleMap.ECHO_READER,
      parameters: { requireOfficeDay: true },
      priority: 5,
    },
    {
      name: "ECG reading requires office day",
      description: "Physician must have an office day on the scheduled date",
      ruleType: "PREREQUISITE" as const,
      roleTypeId: roleMap.ECG_READER,
      parameters: { requireOfficeDay: true },
      priority: 5,
    },
    {
      name: "General call even distribution (ignore FTE)",
      description: "Distribute general call assignments evenly regardless of FTE",
      ruleType: "DISTRIBUTION" as const,
      roleTypeId: roleMap.GENERAL_CALL,
      parameters: { distributeEvenly: true, ignoreFTE: true },
      priority: 1,
    },
    {
      name: "Interventional call restricted to interventionalists",
      description: "Only interventionalists can take interventional call",
      ruleType: "EXCLUSION" as const,
      roleTypeId: roleMap.INTERVENTIONAL_CALL,
      parameters: { requireSubspecialty: "isInterventionalist" },
      priority: 10,
    },
    {
      name: "EP call restricted to EP physicians",
      description: "Only electrophysiologists can take EP call",
      ruleType: "EXCLUSION" as const,
      roleTypeId: roleMap.EP_CALL,
      parameters: { requireSubspecialty: "isEP" },
      priority: 10,
    },
    {
      name: "Cardioversion/TEE restricted to eligible physicians",
      description: "Only eligible physicians can perform cardioversion/TEE procedures",
      ruleType: "EXCLUSION" as const,
      roleTypeId: roleMap.CARDIOVERSION_TEE,
      parameters: { requireEligibility: true },
      priority: 10,
    },
    {
      name: "No back-to-back overnight call",
      description: "Physician cannot be on call two consecutive days",
      ruleType: "CONFLICT" as const,
      roleTypeId: null,
      parameters: { noConsecutiveCallDays: true, callCategories: ["ON_CALL"] },
      priority: 8,
    },
    {
      name: "No consecutive weekend call",
      description: "Physician cannot be on call two weekends in a row",
      ruleType: "CONFLICT" as const,
      roleTypeId: null,
      parameters: { noConsecutiveWeekendCall: true, callCategories: ["ON_CALL"] },
      priority: 7,
    },
  ];

  for (const rule of rules) {
    await prisma.schedulingRule.upsert({
      where: {
        id: `rule-${rule.name.replace(/\s+/g, "-").toLowerCase().slice(0, 30)}`,
      },
      update: {},
      create: {
        id: `rule-${rule.name.replace(/\s+/g, "-").toLowerCase().slice(0, 30)}`,
        ...rule,
      },
    });
  }

  // --- Holidays ---
  const holidays = [
    { name: "New Year's Day", weight: 1 },
    { name: "Memorial Day", weight: 1 },
    { name: "Independence Day", weight: 1 },
    { name: "Labor Day", weight: 1 },
    { name: "Thanksgiving", weight: 2 },
    { name: "Christmas Eve", weight: 2 },
    { name: "Christmas Day", weight: 2 },
  ];

  for (const holiday of holidays) {
    await prisma.holiday.upsert({
      where: { name: holiday.name },
      update: { weight: holiday.weight },
      create: holiday,
    });
  }

  // --- Admin User ---
  const adminPasswordHash = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { email: "admin@cardiopractice.com" },
    update: {},
    create: {
      email: "admin@cardiopractice.com",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      physician: {
        create: {
          firstName: "Admin",
          lastName: "User",
          fteDays: 200,
          isInterventionalist: false,
          isEP: false,
        },
      },
    },
  });

  // --- Sample Physicians ---
  // Placeholder names - you'll replace these with real physician names
  const physicians = [
    {
      firstName: "James",
      lastName: "Wilson",
      email: "jwilson@cardiopractice.com",
      isInterventionalist: true,
      isEP: false,
      officeDays: [1, 3, 5], // Mon, Wed, Fri
      roles: [
        "GENERAL_CALL",
        "INTERVENTIONAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "Sarah",
      lastName: "Chen",
      email: "schen@cardiopractice.com",
      isInterventionalist: true,
      isEP: false,
      officeDays: [2, 4], // Tue, Thu
      roles: [
        "GENERAL_CALL",
        "INTERVENTIONAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "Michael",
      lastName: "Patel",
      email: "mpatel@cardiopractice.com",
      isInterventionalist: true,
      isEP: false,
      officeDays: [1, 2, 4], // Mon, Tue, Thu
      roles: [
        "GENERAL_CALL",
        "INTERVENTIONAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "Emily",
      lastName: "Rodriguez",
      email: "erodriguez@cardiopractice.com",
      isInterventionalist: false,
      isEP: true,
      officeDays: [1, 3, 5],
      roles: [
        "GENERAL_CALL",
        "EP_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "David",
      lastName: "Kim",
      email: "dkim@cardiopractice.com",
      isInterventionalist: false,
      isEP: true,
      officeDays: [2, 3, 5],
      roles: [
        "GENERAL_CALL",
        "EP_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "Lisa",
      lastName: "Thompson",
      email: "lthompson@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [1, 2, 3],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "Robert",
      lastName: "Martinez",
      email: "rmartinez@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [2, 4, 5],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "Jennifer",
      lastName: "Anderson",
      email: "janderson@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [1, 3, 4],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "William",
      lastName: "Taylor",
      email: "wtaylor@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [1, 2, 5],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "Karen",
      lastName: "White",
      email: "kwhite@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [3, 4, 5],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "Christopher",
      lastName: "Harris",
      email: "charris@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [1, 2, 4],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
      ],
    },
    {
      firstName: "Patricia",
      lastName: "Clark",
      email: "pclark@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [2, 3, 5],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "MPI_READER",
        "CARDIOVERSION_TEE",
      ],
    },
    {
      firstName: "Daniel",
      lastName: "Lewis",
      email: "dlewis@cardiopractice.com",
      isInterventionalist: false,
      isEP: false,
      officeDays: [1, 4, 5],
      roles: [
        "GENERAL_CALL",
        "HOSPITAL_ROUNDER",
        "ICU_ROUNDER",
        "DOC_IN_BOX",
        "ECHO_READER",
        "ECG_READER",
        "CT_FFR_READER",
        "MPI_READER",
      ],
    },
  ];

  const defaultPassword = await bcrypt.hash("cardio123", 12);

  for (const doc of physicians) {
    const existing = await prisma.user.findUnique({
      where: { email: doc.email },
    });

    if (!existing) {
      const user = await prisma.user.create({
        data: {
          email: doc.email,
          passwordHash: defaultPassword,
          role: "PHYSICIAN",
          physician: {
            create: {
              firstName: doc.firstName,
              lastName: doc.lastName,
              fteDays: 200,
              isInterventionalist: doc.isInterventionalist,
              isEP: doc.isEP,
              officeDays: {
                create: doc.officeDays.map((dayOfWeek) => ({ dayOfWeek })),
              },
              eligibilities: {
                create: doc.roles.map((roleName) => ({
                  roleTypeId: roleMap[roleName],
                })),
              },
            },
          },
        },
      });

      console.log(`  Created: Dr. ${doc.firstName} ${doc.lastName}`);
    } else {
      console.log(`  Skipped (exists): ${doc.email}`);
    }
  }

  console.log("\nSeed complete!");
  console.log("\nLogin credentials:");
  console.log("  Admin:     admin@cardiopractice.com / admin123");
  console.log("  Physicians: [email]@cardiopractice.com / cardio123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
