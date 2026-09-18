This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backups

The database lives on Neon. Neon keeps its own restore window, but that is a
safety net rather than a backup: it expires, and it goes away with the account.
For anything you would be unhappy to lose, take your own dump.

```bash
./scripts/backup-db.sh
```

It reads `DATABASE_URL` from `.env` and writes a compressed dump to
`~/cardio-backups/` (override with `BACKUP_DIR`). Run it **before anything bulk
or structural** — a schema migration, an Excel vacation import, a bulk delete.
Those are the operations that a restore window alone will not save you from.

Dumps contain real physician schedules. `.gitignore` covers `*.dump`, and the
default backup directory sits outside the repo, so one cannot be committed by
accident.

To restore one — this replaces the target database's contents:

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/cardio-backups/cardio-YYYYMMDD-HHMMSS.dump
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
