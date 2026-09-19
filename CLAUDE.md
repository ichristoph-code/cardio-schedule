# CardioSchedule — notes for AI sessions

Read this first. It holds the decisions and context that live nowhere else in
the repo. Commit messages and PR descriptions (#28 onward) carry the *why* of
each change; this file carries the rules that span changes.

## Who you're working with

Ian is a cardiologist building this for his own practice, and is learning to
code as he goes. He is sharp and catches real errors — trust his read of the
domain over your read of the code. Two things he has asked for explicitly:

- **Define a term the first time you use it**, then keep using that same term.
  Don't swap in a synonym later ("check out" → "step onto") without saying
  they're the same thing.
- **Tell him when an idea is a bad one.** Push back with reasons, then do what
  he decides.

He runs the app locally on a Mac, reviews changes via Vercel preview links
(the `vercel[bot]` comment on each PR) or by checking out the branch, and
merges on GitHub himself. Explain a git concept in one sentence when it comes
up; don't lecture.

## The workflow, as settled

- Every change is a branch + PR, squash-merged into `main`. `main` deploys to
  production automatically via Vercel. Delete branches after merging.
- Before any push: `tsc --noEmit`, `eslint` on touched files, `pnpm test`,
  and `next build`. The pre-commit hook runs typecheck + tests.
- Say plainly when something was not verified in a browser — there is no
  database in a cloud session, so UI changes are reasoned about, not watched.
  Vercel previews are how Ian verifies.
- **Never diagnose a production failure without the error text.** The
  sticky-year feature (#33) was "fixed" twice on plausible theories, both
  wrong, and reverted (#36). Vercel → Logs first; patch second.
- Wait for a real error before retrying a reverted feature.

## Domain rules (decided by Ian — don't relitigate)

- **If the admin sets it, it's real.** A schedule's DRAFT/PUBLISHED status is
  the admin's own marker for the Group Schedule; it never hides anything from
  a physician. Every physician-facing view — My Vacation & Work Calendar, My
  Task Calendar, the phone feed — shows assignments from any schedule.
- **Calendars default to 2027** (`DEFAULT_CALENDAR_YEAR` in
  `src/lib/calendar-years.ts`). Hardcoded on purpose; change the one number
  when the practice moves on. A per-user remembered year was tried and
  reverted — see the task list before reattempting.
- **Tallies are counted in weekdays** (`src/lib/year-tallies.ts`): half day
  = ½ day; weekend holidays don't count; a weekday on call is still a weekday
  worked. `weekdays === holidays + vacationDays + weekdaysWorked`.
- **Christmas Eve is Dec 24.** When Dec 25 is a Saturday, the *Christmas Day
  observance* moves to Dec 23 — never the Eve. (2027 built-in holiday count
  is 9; Ian was going to confirm whether that's right for the practice.)
- **One colour per concept, everywhere** (`src/lib/colors.ts`). Vacation is
  emerald, holidays yellow, call black, float blue, ICU rounder purple,
  no-call slate, hospital rounder rose, echo reader cyan, MPI reader indigo,
  doc in the box brown, any other duty orange. Don't introduce a new colour
  for an existing concept. On the Full Year view of My Task Calendar each of
  those duty days also carries a short code under the number (HR, Echo, MPI,
  DITB) and the legend spells the code out — colour is never the only signal.
- **Calendar feed** (`/api/ics/<token>`): all-day events, no reminders,
  no-call days left out. These were explicit choices.

## What's parked (kept in code, hidden in UI) — and why

- **Requests page and the request/approval flow** — "on hold until the
  initial rollout is complete." Hidden from physicians; greyed for admins
  under a caption in the sidebar (`parked` flag in `Sidebar.tsx`). The
  physician's vacation/no-call request calendar (`AnnualPreferencesView.tsx`)
  is no longer rendered on My Preferences; the component and its API routes
  are intact. If it returns, its palette was already aligned to
  `colors.ts`.
- **Dashboard page** — same treatment.
- **Sticky (remembered) year** — reverted pending a real production error.

## Physician vs admin

Physicians see four nav items: My Vacation & Work Calendar, My Task Calendar,
Group Schedule, My Preferences. Admins see Physician Vacation & Work
Calendar, Group Schedule, Physicians/Users, Rules, Settings, then the parked
pair greyed out. My Preferences holds only preferred task day, MPI reading
day, and the calendar-subscription link.

## Infrastructure notes

- Database is Neon (Postgres). It sleeps when idle; the first connection
  after a pause can time out. Ian's laptop has had flaky connections to it;
  when local dev shows "Unable to load this page", suspect Neon before code.
- **Migrations run only on production builds** (`scripts/vercel-build.sh`,
  gated on `VERCEL_ENV`). Previews compile against the existing schema, so a
  PR with a migration will 500 on its preview for the routes that need the
  new column — say so in the PR.
- `./scripts/backup-db.sh` dumps the database. Run it before any migration or
  bulk import.
- Cloud sessions can push branches but **cannot push tags or delete
  branches** — ask Ian to do those.
