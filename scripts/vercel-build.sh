#!/usr/bin/env bash
#
# Build for Vercel. Run database migrations only when this build is going to
# production; previews compile against the schema as it already stands.
#
# Why: Vercel builds every pushed branch, and each build used to run
# `prisma migrate deploy` against the one production database. Two branches
# pushed close together raced for migrate's advisory lock and the loser died
# with P1002. Worse, a branch carrying a migration would alter production the
# moment its preview built — before anyone reviewed or merged it.
#
# Vercel sets VERCEL_ENV to "production" or "preview". Local `pnpm build` has it
# unset and skips migrations too; run `pnpm db:migrate` yourself for that.
#
# The `migrate resolve` line marks one historical migration as applied without
# running it (its SQL was hand-applied once); the `|| true` keeps it harmless
# when Prisma reports it already resolved.

set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "→ production build: applying database migrations"
  prisma migrate resolve --applied 20260917130000_custom_holiday_hidden || true
  prisma migrate deploy
else
  echo "→ ${VERCEL_ENV:-local} build: skipping database migrations"
fi

next build
