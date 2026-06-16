import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

// ---- copied from scheduler.ts ----
function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayOfWeek(s: string) { const [y,m,d]=s.split("-").map(Number); const j=new Date(y,m-1,d).getDay(); return j===0?7:j; }
function isWeekend(dow: number) { return dow>=6; }

function observedDate(d: Date) {
  const r = new Date(d);
  const dow = r.getDay();
  if (dow === 6) r.setDate(r.getDate() - 1); // Saturday -> Friday
  else if (dow === 0) r.setDate(r.getDate() + 1); // Sunday -> Monday
  return r;
}
function getHolidays(year: number) {
  const map = new Map<string,string>();
  map.set(formatDate(observedDate(new Date(year,0,1))),"NY");
  map.set(formatDate(observedDate(new Date(year,6,4))),"4th");
  const xmas=observedDate(new Date(year,11,25));
  const xmasEve=new Date(year,11,24);
  if (formatDate(xmas)===formatDate(xmasEve)) {
    xmasEve.setDate(xmasEve.getDate()-1);
    while(xmasEve.getDay()===0||xmasEve.getDay()===6) xmasEve.setDate(xmasEve.getDate()-1);
  }
  map.set(formatDate(xmasEve),"XmasEve");
  map.set(formatDate(xmas),"Xmas");
  const mem=new Date(year,4,31); while(mem.getDay()!==1) mem.setDate(mem.getDate()-1); map.set(formatDate(mem),"MemDay");
  const lab=new Date(year,8,1); while(lab.getDay()!==1) lab.setDate(lab.getDate()+1); map.set(formatDate(lab),"LaborDay");
  const tg=new Date(year,10,1); while(tg.getDay()!==4) tg.setDate(tg.getDate()+1); tg.setDate(tg.getDate()+21); map.set(formatDate(tg),"TG");
  return map;
}

function hamiltonAllocate(weights: {id:string;weight:number}[], total: number) {
  const tw = weights.reduce((s,w)=>s+w.weight,0);
  if (!tw||!total) return {} as Record<string,number>;
  const raw = weights.map((w,i)=>{ const e=(w.weight/tw)*total; return {id:w.id,floor:Math.floor(e),rem:e-Math.floor(e),origIdx:i}; });
  const rem = total - raw.reduce((s,r)=>s+r.floor,0);
  raw.sort((a,b)=>b.rem-a.rem||a.origIdx-b.origIdx);
  const res: Record<string,number>={};
  raw.forEach((r,i)=>{ res[r.id]=r.floor+(i<rem?1:0); });
  return res;
}

function countEchoDays(year: number, start: number, end: number, holidays: Map<string,string>) {
  let n=0;
  const s=new Date(year,start-1,1), e=new Date(year,end,0);
  for (let d=new Date(s); d<=e; d.setDate(d.getDate()+1)) {
    const ds=formatDate(d), dow=dayOfWeek(ds);
    if (!isWeekend(dow) && !holidays.has(ds)) n++;
  }
  return n;
}
// ----------------------------------

async function main() {
  const year = 2026, startMonth = 6, endMonth = 12;
  const holidays = getHolidays(year);
  const totalDays = countEchoDays(year, startMonth, endMonth, holidays);

  // Load echo role
  const echoRole = await prisma.roleType.findFirst({ where: { name: "ECHO_READER" } });
  if (!echoRole) { console.log("ECHO_READER not found"); return; }

  // Load eligible physicians sorted by name (same order as scheduler)
  const physicians = await prisma.physician.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { eligibilities: true },
  });
  const eligible = physicians
    .filter(p => p.eligibilities.some((e:any) => e.roleTypeId === echoRole.id))
    .sort((a,b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  // Compute Hamilton targets
  const targets = hamiltonAllocate(
    eligible.map(p => ({ id: p.id, weight: p.fteDays })),
    totalDays
  );

  console.log(`\nHamilton targets — ECHO_READER ${year} Jun–Dec (${totalDays} echo days)\n`);
  console.log("Physician            FTE     Target");
  console.log("─".repeat(40));
  const totalFte = eligible.reduce((s,p)=>s+p.fteDays,0);
  const rows = eligible.map(p => ({
    name: `${p.lastName}, ${p.firstName}`,
    fte: (p.fteDays/200).toFixed(2),
    target: targets[p.id] ?? 0,
  })).sort((a,b)=>b.target-a.target);
  rows.forEach(r => console.log(`${r.name.padEnd(20)} ${r.fte} FTE   ${r.target}`));
  console.log("─".repeat(40));
  console.log(`${"Total".padEnd(20)}        ${rows.reduce((s,r)=>s+r.target,0)}`);

  // Now compare against current schedule
  const schedule = await prisma.schedule.findUnique({ where: { year } });
  if (!schedule) { console.log("\nNo schedule in DB to compare."); return; }

  const assignments = await (prisma.scheduleAssignment as any).findMany({
    where: {
      scheduleId: schedule.id,
      roleTypeId: echoRole.id,
      date: { gte: new Date(year, startMonth - 1, 1), lte: new Date(year, endMonth, 0) },
    },
  });
  const actual: Record<string,number> = {};
  for (const a of assignments) actual[a.physicianId] = (actual[a.physicianId]??0)+1;

  console.log(`\nCurrent schedule vs targets (${assignments.length} total assignments):\n`);
  console.log("Physician            Target  Actual  Delta");
  console.log("─".repeat(46));
  let anyDiff = false;
  rows.forEach(r => {
    const p = eligible.find(p2 => `${p2.lastName}, ${p2.firstName}` === r.name)!;
    const act = actual[p.id]??0;
    const delta = act - r.target;
    if (delta !== 0) anyDiff = true;
    console.log(`${r.name.padEnd(20)} ${String(r.target).padStart(6)}  ${String(act).padStart(6)}  ${delta>0?"+":""}${delta}`);
  });
  if (!anyDiff) console.log("\n✓ All actual totals match Hamilton targets exactly.");
  else console.log("\n✗ Mismatch — regenerate and re-run to check.");
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
