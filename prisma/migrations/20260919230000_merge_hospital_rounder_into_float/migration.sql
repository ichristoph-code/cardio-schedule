-- Hospital Rounder and Hospital Float are one real-world job (Ian, 2026-09-19).
-- The database held them as two roles: HOSPITAL_FLOAT, entered by hand or from
-- the practice's Excel sheet, and HOSPITAL_ROUNDER, invented by the generator.
-- On 245 days of 2026 both were filled, 171 of them with different physicians.
--
-- This folds HOSPITAL_ROUNDER into HOSPITAL_FLOAT. Data only; no schema change.
-- Where both roles are filled on the same day of the same schedule, the float
-- row wins ("if the admin sets it, it's real") and the rounder row is dropped.
-- Every other rounder row becomes a float row, keeping its physician and source.
--
-- Safe to run in any state: with no HOSPITAL_ROUNDER role it does nothing; with
-- no HOSPITAL_FLOAT role it simply renames the rounder role.

DO $$
DECLARE
  rounder_id TEXT;
  float_id   TEXT;
BEGIN
  SELECT id INTO rounder_id FROM "RoleType" WHERE name = 'HOSPITAL_ROUNDER';
  SELECT id INTO float_id   FROM "RoleType" WHERE name = 'HOSPITAL_FLOAT';

  IF rounder_id IS NULL THEN
    RETURN;
  END IF;

  IF float_id IS NULL THEN
    UPDATE "RoleType"
       SET name = 'HOSPITAL_FLOAT', "displayName" = 'Hospital Float'
     WHERE id = rounder_id;
    RETURN;
  END IF;

  -- Assignments: the float row wins a shared day; the rest move across.
  DELETE FROM "ScheduleAssignment" r
   USING "ScheduleAssignment" f
   WHERE r."roleTypeId" = rounder_id
     AND f."roleTypeId" = float_id
     AND f."scheduleId" = r."scheduleId"
     AND f.date = r.date;
  UPDATE "ScheduleAssignment" SET "roleTypeId" = float_id WHERE "roleTypeId" = rounder_id;

  -- Eligibility: whoever could be hospital rounder can be float.
  DELETE FROM "PhysicianEligibility" r
   USING "PhysicianEligibility" f
   WHERE r."roleTypeId" = rounder_id
     AND f."roleTypeId" = float_id
     AND f."physicianId" = r."physicianId";
  UPDATE "PhysicianEligibility" SET "roleTypeId" = float_id WHERE "roleTypeId" = rounder_id;

  -- Holiday assignments: same rule as assignments (one per holiday/year/role).
  DELETE FROM "HolidayAssignment" r
   USING "HolidayAssignment" f
   WHERE r."roleTypeId" = rounder_id
     AND f."roleTypeId" = float_id
     AND f."holidayId" = r."holidayId"
     AND f.year = r.year;
  UPDATE "HolidayAssignment" SET "roleTypeId" = float_id WHERE "roleTypeId" = rounder_id;

  -- Rules and swap requests just follow the role.
  UPDATE "SchedulingRule" SET "roleTypeId" = float_id WHERE "roleTypeId" = rounder_id;
  UPDATE "SwapRequest"    SET "roleTypeId" = float_id WHERE "roleTypeId" = rounder_id;

  -- Float takes the rounder's place in the role order and its staffing numbers,
  -- then the rounder role goes.
  UPDATE "RoleType" f
     SET "sortOrder"   = r."sortOrder",
         "minRequired" = r."minRequired",
         "maxRequired" = r."maxRequired",
         description   = 'Daytime hospital coverage, one physician Mon-Fri. Generated in weekly blocks; a day an admin enters by hand wins. Blocks reading.'
    FROM "RoleType" r
   WHERE f.id = float_id AND r.id = rounder_id;
  DELETE FROM "RoleType" WHERE id = rounder_id;
END $$;
