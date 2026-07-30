# Production Deployment

## Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy the Project URL and anon public key.

The app stores each parsed scorecard as one row in `public.matches`. The parsed JSON remains the source for scorecards and stats.

## Vercel

Add these environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Local Development

Copy `.env.example` to `.env.local` and fill the Supabase values if you want local dev to use Supabase.

Without env vars, the app uses browser localStorage and includes the sample match.
