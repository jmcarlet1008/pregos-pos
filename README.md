# Pregos POS

iPad point-of-sale PWA for Prego's Cucina — offline-first order taking, inventory, and analytics, with Supabase cloud sync. See [plan.md](plan.md) for the full project plan.

## Development

```
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and anon key. `.env.local` is gitignored — never commit real Supabase keys.

## Deploying to Cloudflare Pages

This project builds to a static `dist/` folder that Cloudflare Pages can serve as-is.

**Build settings (Pages dashboard → your project → Settings → Builds & deployments):**

| Setting                | Value           |
| ---------------------- | --------------- |
| Build command          | `npm run build` |
| Build output directory | `dist`          |

**Environment variables (Settings → Environment variables):**

Set these for both Production and Preview so the deployed app can reach Supabase:

| Variable                 | Value                                             |
| ------------------------ | -------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase project's anon/public key             |

These are the same values as your local `.env.local`. Without them the app still runs offline against local IndexedDB, but cloud sync will stay disabled.

## Installing on iPad

Open the deployed URL in **Safari** on the iPad → **Share** → **Add to Home Screen**. The app launches full-screen with no browser chrome and works offline. An in-app copy of these steps is also available under **Settings → Install on iPad**.
