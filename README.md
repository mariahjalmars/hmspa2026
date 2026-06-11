# HM Spaa 2026

A private, kid-friendly World Cup 2026 prediction game for family and friends.

## What is included

- Mobile-first Next.js App Router app
- Player creation with optional avatar upload
- Supabase tables for players, matches, and predictions
- Manual demo match seeding
- Score predictions that lock after kickoff
- Leaderboard with calculated points
- Simple `/admin` page for entering results and recalculating prediction points

## Scoring

- Exact score: 5 points
- Correct outcome: 3 points
- Correct goal difference bonus: 1 point

Example: predicting `2-1` when the result is `3-2` gives 4 points.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example`:

   ```bash
   cp .env.example .env.local
   ```

3. Add your Supabase project values to `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. In Supabase, open the SQL editor and run:

   ```sql
   -- Paste the contents of supabase/schema.sql here
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`.

## First run

1. Go to `/admin`.
2. Click **Seed demo matches**.
3. Go back to the game.
4. Create a player, upload an avatar, and save predictions.
5. After a match is finished, return to `/admin`, enter the result, save the match, and click **Recalculate points**.

## Supabase notes

The MVP intentionally has simple open Row Level Security policies because this is a private game and authentication is not built yet. Before making it public, add proper authentication and restrict admin writes.

The avatar bucket is named `avatars` and is public so uploaded profile pictures can be shown in the leaderboard.

## Demo mode

If Supabase environment variables are missing, the app still opens and shows demo matches, but saving players, avatars, predictions, and admin changes is disabled.
