# Committee Flow

Realtime Model United Nations control room built with React, Supabase, and Vercel.

## What is included

- Chair dashboard with live speaker queue, vote controls, draft signatories, committee notes, and AI copilot rail
- Delegate dashboard with anonymous join, country claiming, placard requests, voting, and draft sign-ons
- Supabase SQL schema with RPC functions, event logging, RLS, and realtime publication setup
- Vercel serverless function that proxies Anthropic so the API key never touches the browser

## Stack

- Frontend: React + Vite
- Backend: Supabase Postgres + Realtime + anonymous auth
- Hosting: Vercel static site + `/api/ai` serverless function

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` from `.env.example` and add:

   ```bash
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

3. In Supabase:

   - Create a new project
   - Enable anonymous auth in `Authentication -> Providers -> Anonymous`
   - Open the SQL editor and run [`supabase/schema.sql`](./supabase/schema.sql)

4. Start the frontend:

   ```bash
   npm run dev
   ```

## Vercel deploy

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Add these environment variables in Vercel:

   ```bash
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ANTHROPIC_API_KEY=...
   ANTHROPIC_MODEL=claude-3-5-sonnet-latest
   ```

4. Deploy.

The Vite app serves the chair and delegate dashboards. The `/api/ai` route handles Claude requests on the server side.

## App flow

1. Create a committee from the landing page.
2. Copy the generated chair link, delegate link, and session code.
3. Open the chair dashboard from the private chair link.
4. Delegates open the delegate link, enter the code if needed, and claim countries.
5. Chair actions and delegate actions sync through Supabase realtime.

## Notes

- This version assumes low-friction school MUN workflows, not high-security conferencing.
- Country choices live in [`src/data/countries.js`](./src/data/countries.js).
- The AI prompt is intentionally conservative about procedure: it states assumptions when rules depend on the exact ruleset.
