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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

  ┌───────────┬──────────────────────────────────────────────────────────────────────────────┐
  │   Phase   │                                     What                                     │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Scaffold  │ Next.js 16 + TypeScript + Tailwind v4 + shadcn v4 + Supabase clients         │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Database  │ 8 SQL migrations: 6 tables, 1 view, 2 enums, Haversine function, full RLS    │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Airports  │ CSV import script (40K airports), trigram search API, debounced combobox     │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Family    │ CRUD server actions, member cards, add/edit dialog, delete confirmation      │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Flights   │ Commercial + GA forms, passenger roles, Haversine distance, list/detail/edit │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Visits    │ Non-flight travel log with member selection, CRUD, list/edit pages           │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Dashboard │ Stats grid, per-member breakdown, recent flights                             │
  └───────────┴──────────────────────────────────────────────────────────────────────────────┘

  To get running:
  1. Create a Supabase project and update .env.local with real credentials
  2. Run the SQL migrations in supabase/migrations/ against your project
  3. Run npx tsx scripts/import-airports.ts to import airport data
  4. npm run dev to start the app
