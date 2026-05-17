import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

async function main() {
  const echoRole = await prisma.roleType.findFirst({ where: { name: "ECHO_READER" } });
  if (!echoRole) { console.log("ECHO_READER role not found"); return; }

  const schedule = await prisma.schedule.findUnique({ where: { year: 2026 } });
  if (!schedule) { console.log("No 2026 schedule"); return; }

  const assignments = await (prisma.scheduleAssignment as any).findMany({
    where: { scheduleId: schedule.id, roleTypeId: echoRole.id },
    include: { physician: { select: { firstName: true, lastName: true, fteDays: true } } },
    orderBy: { date: "asc" },
  });

  // --- Annual totals ---
  const annualCounts: Record<string, { days: number; fte: number }> = {};
  // monthGrid[name][month] = count
  const monthGrid: Record<string, number[]> = {};

  for (const a of assignments) {
    const name = `${a.physician.lastName}, ${a.physician.firstName}`;
    if (!annualCounts[name]) { annualCounts[name] = { days: 0, fte: a.physician.fteDays }; }
    annualCounts[name].days++;

    const month = new Date(a.date).getUTCMonth(); // 0-based
    if (!monthGrid[name]) monthGrid[name] = new Array(12).fill(0);
    monthGrid[name][month]++;
  }

  const totalFte = Object.values(annualCounts).reduce((s, v) => s + v.fte, 0);
  console.log(`\nEcho Reader — 2026 (${assignments.length} total assignments)\n`);
  console.log("Physician            FTE     Days  % of total  (FTE target)");
  console.log("─".repeat(62));
  const sorted = Object.entries(annualCounts).sort((a, b) => b[1].days - a[1].days);
  sorted.forEach(([name, { days, fte }]) => {
    const pct = ((days / assignments.length) * 100).toFixed(1);
    const ftePct = ((fte / totalFte) * 100).toFixed(1);
    console.log(
      `${name.padEnd(20)} ${(fte / 200).toFixed(2)} FTE   ${String(days).padStart(3)}   ${pct.padStart(5)}%    ${ftePct}%`
    );
  });

  // --- Per-month grid ---
  console.log(`\nPer-month breakdown:\n`);
  const nameCol = 20;
  const header = "Physician".padEnd(nameCol) + MONTH_NAMES.map(m => m.padStart(4)).join("") + "  Total";
  console.log(header);
  console.log("─".repeat(header.length));

  sorted.forEach(([name]) => {
    const row = monthGrid[name] ?? new Array(12).fill(0);
    const total = row.reduce((s, v) => s + v, 0);
    console.log(
      name.padEnd(nameCol) + row.map(v => String(v).padStart(4)).join("") + `  ${total}`
    );
  });

  // Monthly column totals
  const colTotals = new Array(12).fill(0);
  for (const row of Object.values(monthGrid)) {
    row.forEach((v, i) => { colTotals[i] += v; });
  }
  console.log("─".repeat(header.length));
  console.log(
    "Total".padEnd(nameCol) + colTotals.map(v => String(v).padStart(4)).join("") + `  ${colTotals.reduce((s, v) => s + v, 0)}`
  );

  // --- Min/max per month ---
  console.log("\nMin/Max per physician per month (active months only):");
  const perPhys: number[] = [];
  for (const [, row] of Object.entries(monthGrid)) {
    const active = row.filter(v => v > 0);
    perPhys.push(...active);
  }
  if (perPhys.length) {
    console.log(`  Min: ${Math.min(...perPhys)}  Max: ${Math.max(...perPhys)}`);
  }
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
