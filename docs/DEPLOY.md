# Deploy GrowEasy Importer

Production split: **Vercel** (Next.js frontend) + **Railway** (Express API).

Estimated time: ~15 minutes once accounts exist.

## Prerequisites

- [Vercel](https://vercel.com) account (free tier works)
- [Railway](https://railway.app) account
- OpenAI API key with billing enabled
- Optional: [Supabase](https://supabase.com) project for durable imports

## 1. Deploy the API (Railway)

1. **New Project → Deploy from GitHub** → select `habinrahman/AI-CSV-IMPORTER`
2. Railway reads [`railway.toml`](../railway.toml) — builds `backend/Dockerfile`
3. Set environment variables (minimum):

   | Variable | Value |
   |----------|-------|
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `CORS_ORIGIN` | `https://<your-vercel-domain>` (exact, no trailing slash) |
   | `NODE_ENV` | `production` |

4. Optional: `DATABASE_URL` = Supabase transaction pooler URL (port 6543), then run once locally:

   ```bash
   DATABASE_URL=postgresql://... npm run db:push --workspace backend
   ```

5. Copy the Railway public URL (e.g. `https://groweasy-api.up.railway.app`)

6. Verify: `curl https://<railway-url>/api/health`

## 2. Deploy the frontend (Vercel)

1. **Import** `habinrahman/AI-CSV-IMPORTER` on Vercel
2. **Root Directory:** `frontend`
3. Framework preset: **Next.js** (auto-detected)
4. Environment variable:

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | Your Railway URL from step 1 |

5. Deploy. The `vercel-build` script builds `@groweasy/shared` automatically.

6. Update Railway `CORS_ORIGIN` to match the exact Vercel URL if it changed.

## 3. Post-deploy smoke test

1. Open the Vercel URL
2. Upload [`samples/leads-messy.csv`](../samples/leads-messy.csv)
3. Confirm preview shows synonym headers (`Correo`, `Primary Mobile`)
4. Start import → watch SSE progress → review results → export CSV

See [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md) for the full verification list.

## 4. Update README

After deploy, add live URLs to the README Demo section:

```markdown
| **Hosted app** | https://your-app.vercel.app |
| **API**        | https://your-api.up.railway.app |
```

## CLI quick deploy (alternative)

```bash
# Railway (after railway login)
railway link
railway up

# Vercel (after vercel login, from frontend/)
cd frontend
vercel --prod
vercel env add NEXT_PUBLIC_API_URL production
```

## Social preview image

Upload [`social-preview.png`](social-preview.png) in GitHub:

**Repository → Settings → General → Social preview → Upload an image**

Recommended size: 1280×640 px.

## Re-record demo GIF after deploy

With a live deployment or local stack + OpenAI key:

```bash
OPENAI_API_KEY=sk-... npm run record:demo
```

Output: `docs/screenshots/demo.gif` plus refreshed PNG screenshots.
