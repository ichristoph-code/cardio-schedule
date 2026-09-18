# CardioSchedule — UX & readiness review for the 2027 go-live

_Written September 2026 against v0.4.9. Items marked ✅ were fixed on the
`claude/jolly-turing-ppr511` branch; everything else is a recommendation,
ordered by impact within each section._

## TL;DR — what to do, in order

1. **Turn on nothing new visually until the "hardcoded light colors" sweep is done** (§2). The foundations are already good; the app looks dated in a few specific places, not everywhere.
2. **Ship the go-live safety items** (§1). Two were security holes ✅, two were data bugs ✅, the rest are workflow gaps.
3. **Add the three features physicians will actually notice**: calendar subscription (ICS), email notifications, and a "who's on today" board (§4).
4. **Write route-level permission tests and a 2027 scheduler golden test** before you trust the generator with real people (§6).

---

## 1. Go-live blockers and correctness

| Status | Item | Where |
|---|---|---|
| ✅ | Rules page had **no auth check** — any physician could open it | `src/app/dashboard/rules/page.tsx` |
| ✅ | Physician profile page had **no auth check** — emails, phones, FTE visible to any user | `src/app/dashboard/physicians/[id]/page.tsx` |
| ✅ | My Preferences only loaded the *current* year; paging to 2027 showed an empty calendar, inviting double-booking | `my-preferences/page.tsx`, `AnnualPreferencesView.tsx` |
| ✅ | Swap approval picked the *newest* schedule, not the one for the request's date; at New Year it targets the wrong year. It also "approved" silently when the assignment didn't exist | `api/swap-requests/[id]/route.ts` |
| ☐ | **Swap is a give-away, not a swap.** Only the *from* side is reassigned. Either rename the feature ("Cover my shift") or make the peer take the other person's assignment on a second date. | same route |
| ☐ | **Approve/Deny on Requests fires instantly** with no confirm and no place to type the review note the API already accepts. Add a small confirm popover with an optional note. | `RequestsView.tsx` |
| ☐ | **Bulk vacation approval** loops N `fetch` calls from the browser; partial failures are reported only as a count. No-call already has a `/bulk` endpoint — mirror it for vacations. | `RequestsView.tsx:321-349` |
| ☐ | **Year rollover** has no story: no "copy my preferences to next year", no archive button, year pickers are hardcoded ranges (`now-1…now+3` in two places, `2024…2100` in another). Pick one helper (`lib/years.ts`) and use it everywhere. | `PhysicianPicker`, `ScheduleGenerateButton`, `AnnualPreferencesView` |
| ☐ | **Override dialog has no undo.** Since every override is audited, an "Undo last override" that reads the audit row is cheap and very reassuring. | `ScheduleViewer.tsx` |
| ☐ | Conflict checks (vacation / day off / no-call / double-booking) exist **only in the override API**. Surface them proactively: a "Schedule health" panel after generation listing unfilled roles and conflicts. | `api/.../assignments/[assignmentId]/route.ts:107-159` |

## 2. Visual system — "more Apple, less Microsoft"

**Good news:** Inter with SF Pro fallback, oklch color tokens, a 0.75rem radius scale, layered soft shadows on cards and tables, mesh-gradient backgrounds, a glass login card, gradient primary button. That *is* the 2026 look. Don't redesign the foundation.

**What still reads as Microsoft, and the fix for each:**

1. **Dark mode is dead code.** A complete `.dark` token block and hundreds of `dark:` classes exist, but there is no `ThemeProvider`; `next-themes` is only imported by the toaster. **Do not just switch it on** — dozens of components hardcode `bg-white`, `text-gray-900`, `bg-amber-50`, etc. and would be unreadable. Plan: (a) sweep hardcoded colors to tokens (`bg-card`, `text-foreground`, `bg-muted`), (b) add `ThemeProvider` with `attribute="class"` and `defaultTheme="system"`, (c) add a toggle to the header avatar menu. Files with the most hardcoded colors: `AnnualPreferencesView.tsx` (`getCellClasses`), `RequestsView.tsx` (lines ~476, 520, 486, 556, 903).
2. **The Week View grid is the most Excel-looking surface in the app.** Full 1px borders on every cell, 90px columns, `text-[10px]`. Apple-style fix: drop vertical borders, use `divide-y` rows with generous `py-2`, hairline `border-black/[0.06]`, sticky first column and header, weekend columns tinted with `bg-muted/40`, holidays with the same yellow chip the vacation calendar uses. Also: it shows 31 days but is labeled "Week" — rename to "Timeline" or actually make it a week with a month toggle.
3. **Nine `DialogTrigger`s copy-paste a raw button className** (`inline-flex … rounded-md bg-primary h-10 …`). They have the wrong height, wrong radius, no gradient, and **no focus ring**. Replace each with `className={buttonVariants()}` from `ui/button.tsx`. Files: `RequestsView` (2), `AddHolidayDialog`, `AddUserDialog`, `AddRoleTypeDialog`, `AddRuleDialog`, `AddPhysicianDialog`, `ScheduleGenerateButton`.
4. **~20 native `<select>` elements** with `rounded-md h-10` sit next to `rounded-xl h-9` inputs. A `ui/select.tsx` already exists — use it. Same for the `selectClassName` string literal duplicated in four settings/preferences files.
5. **Crayon palette.** `CATEGORY_COLORS` (`bg-red-100 text-red-800 …`) is duplicated verbatim in three files, and `PHYSICIAN_COLORS` is 15 saturated Tailwind hues. Move both into one `lib/colors.ts`, and derive physician colors from a single hue ring at lower chroma (oklch `0.85 0.06 <hue>`) so the schedule looks like one system instead of a highlighter set.
6. **Gradient text headings** appear on 2 of 9 pages. Either use them everywhere or nowhere; Apple would say nowhere. Standardize on `text-2xl font-semibold tracking-tight` for every page H1.
7. **Radius drift**: buttons `rounded-lg`, cards `rounded-2xl`, inputs `rounded-xl`, selects `rounded-md`. Pick `xl` for controls and `2xl` for surfaces.

## 3. Navigation, information architecture, states

- **Sidebar**: nine flat items with three calendar-ish labels ("My Calendar", "Physician Vacation & Work Calendar", "Call and Vacation Preferences"). Group them: **Me** (My Calendar, My Preferences, Requests) / **Group** (Schedule, Vacation & Work Calendar) / **Admin** (Physicians, Rules, Settings) with small section labels. ✅ `aria-current="page"` added.
- **Header is nearly empty.** Add the page title (so the H1 can move out of the content area), a theme toggle, and a bell for pending requests (admins) / swap offers (physicians).
- **Loading states**: only one `dashboard/loading.tsx`. The schedule, vacation, and physicians pages each run 4–7 queries and feel frozen. Add a `loading.tsx` skeleton per heavy route (copy the existing one). Add `not-found.tsx` since two pages call `notFound()`.
- **Empty states** are inconsistent: nice icon+copy on Schedule, bare `<p>` elsewhere. Make a tiny `<EmptyState icon title body action />` and use it on all seven.
- **Error conventions**: some tabs toast, some show inline strings, Audit Log swallows errors silently. Standardize on toast for mutations and inline for form validation.
- **Mobile**: the main area is `overflow-x-auto`; Week View and the 12-column Physicians table just scroll sideways. Physicians on phones want one thing: "am I on today / this week?" — see §4 item 3.

## 4. Features worth adding before or soon after go-live

1. **ICS calendar subscription** (highest value, ~1 day). A per-physician tokenized `webcal://…/api/ics/<token>` feed of their assignments. Physicians add it once to iPhone/Google Calendar and never open the app to check call. Rotate the token from the profile page.
2. **Email notifications** (Resend or Postmark, ~1 day). Events: swap offered to you, swap accepted, request approved/denied, schedule published, password reset. Today a swap offer sits invisible until the peer happens to visit Requests.
3. **"Today" board** (~half day). A mobile-first page (and the default landing on phones) showing who is on each role today and tomorrow, with a tap-to-call phone link. Also the natural home screen for a wall display.
4. **Schedule health panel** after generation: unfilled roles, conflicts, per-physician weekend and holiday counts, plus a fairness spread. Most of the data exists in the 12-column Physicians table; it just needs a readable home.
5. **Exports**: CSV/XLSX of a year's schedule (you already ship `xlsx` for import), per-physician PDF via the existing print path.
6. **Search and shortcuts**: a ⌘K palette (physicians, pages, "go to date") is cheap with `cmdk` and reads very 2026.
7. **PWA manifest** so "Add to Home Screen" gives an icon and full-screen — a few lines in `layout.tsx` metadata plus icons.
8. **Per-physician summary page** ("my year at a glance": calls, weekends, holidays, vacation used) — the yearly calendar plus the stats you already compute.

## 5. Code health noticed in passing

- ✅ Five copies of `getHolidayDatesForYear` → the vacation page (both views) and the group schedule now share `src/lib/holidays.ts`. **The scheduler still has its own copy** (`lib/scheduler.ts:83`) without MLK/Presidents' Day, on purpose: adding them there would remove rounders on those days. Decide explicitly whether the practice treats them as scheduling holidays.
- ✅ Dead code removed: `ScheduleManager.tsx` (unreferenced), `renderStats()` in `ScheduleViewer`.
- ✅ `robots: noindex` added; this is a private clinical tool.
- ☐ `globals.css:251-256` hides `[data-radix-*]` selectors when printing, but the app uses base-ui, not Radix — no-ops. Replace with `[data-slot="dialog-overlay"]` etc.
- ☐ Root-level one-off scripts (`echo_query.ts`, `verify_quotas.ts`) fail lint and should move to `scripts/diagnostics/` (already git-ignored).
- ☐ `PhysicianCalendar` expands vacation ranges with `toISOString()` on local-noon dates — fine in US time zones, wrong at UTC+13. Use `formatLocalDate` from `lib/holidays.ts`.
- ☐ Audit Log shows `userId.slice(0,8)…`; join to `User` and show a name.
- ☐ Settings tab state is not in the URL; refresh loses it.

## 6. Tests

Present: holidays (new), scheduler *date helpers* only, echo allocator (strong), Excel parser (strong).

Missing, in priority order:
1. **Route permission tests** for all ~35 API routes: physician cannot hit admin routes, physician cannot read another physician's data. Two of these would have caught the page bugs above.
2. **Scheduler golden test for 2027**: seed a fixed roster, generate, snapshot the assignment counts per physician and per role; assert no vacation/no-call conflicts and every role filled. This is your regression net for any rule change.
3. **Swap state machine** tests (peer accept → admin approve; wrong-year schedule; missing assignment → 409).
4. Component tests are optional; a single Playwright smoke test (login → view schedule → open vacation calendar → mark holiday) would be worth more than many unit tests here.

## 7. Process note for a solo developer

Branches + PRs are optional for one person, but two things they give you are still worth having: (1) a place for CI to run type-check and tests before code reaches `main`, and (2) a readable history of *why* a change happened. The lightweight version: keep working on short-lived branches, open the PR, let CI run, merge it yourself without waiting for review. Skip branches entirely for typo-level changes. Never let `main` be a branch you're afraid to deploy.
