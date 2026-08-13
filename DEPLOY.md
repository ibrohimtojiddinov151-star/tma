# Deploying TMA

Two pieces deploy separately:

| Piece | Where | Why |
|---|---|---|
| Backend (bot + API + worker) | **Railway** | Needs a process that runs continuously and a Redis instance |
| Mini App (React) | **Vercel** | Static build, already deployed |

Vercel serverless cannot host the bot: long polling, the BullMQ worker and the
cron ticks all need a process that stays alive between requests.

---

## 1. Push the code to GitHub

Railway deploys from a repository. A step-by-step walkthrough, including Git
installation, GitHub authentication and what to do if a secret leaks, is in
**[GIT.md](GIT.md)**.

The short version:

```bash
cd E:\TMA
git init
git add .
git commit -m "TMA: bot, API and Mini App"

git remote add origin https://github.com/<your-username>/tma.git
git branch -M main
git push -u origin main
```

Make the repository **private**.

Before pushing, confirm `.env` is not staged:

```bash
git status
git check-ignore -v .env
```

`.env` must not appear in `git status`, and `check-ignore` must report that it is
ignored. If `.env` does show up, stop: see GIT.md section 10.

---

## 2. Create the Railway project

1. Open <https://railway.app> and sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → pick your `tma` repo
3. Railway detects `Dockerfile` and `railway.json` and starts the first build

The first build takes 2 to 4 minutes. It will fail to boot until step 3 adds the
environment variables. That is expected.

---

## 3. Add Redis

In the same project: **New** → **Database** → **Add Redis**.

Railway injects `REDIS_URL` into the project automatically. Confirm it appears
under your service's **Variables** tab. If it does not, add it manually with the
value `${{Redis.REDIS_URL}}`.

With Redis present, scheduled notifications work. Without it the bot still runs,
just without reminders.

---

## 4. Set the environment variables

Service → **Variables** → **Raw Editor**, paste this and fill in the blanks:

```env
NODE_ENV=production
PORT=3000

BOT_TOKEN=<from BotFather, same value as your local .env>
BOT_WEBHOOK_SECRET=<a long random string, invent one>
PUBLIC_URL=<your Railway domain, filled in at step 5>
WEBAPP_URL=https://<your-vercel-domain>.vercel.app

SUPABASE_URL=<your Supabase project url>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase, Settings -> API>
SUPABASE_ANON_KEY=<publishable key from Supabase>

GEMINI_API_KEY=<from aistudio.google.com/apikey, same as your local .env>
MODEL_PLANNER=gemini-3.1-pro-preview
MODEL_ANALYST=gemini-3.1-pro-preview
MODEL_CHAT=gemini-3.6-flash
MODEL_EDIT=gemini-3.6-flash
MODEL_FALLBACK=gemini-3.5-flash
AI_DAILY_CALL_LIMIT=60

DEFAULT_TIMEZONE=Asia/Tashkent
SESSION_SECRET=<another long random string>
CALL_PROVIDER=none
```

Do not paste `REDIS_URL` by hand. Railway manages it.

The real values are in your local `.env`. Copy them from there. `.env` is
git-ignored on purpose, so it never reaches GitHub.

---

## 5. Generate the domain and switch to webhook mode

Service → **Settings** → **Networking** → **Generate Domain**.

You get something like `tma-production-a1b2.up.railway.app`. Put it into
`PUBLIC_URL` **with `https://` and no trailing slash**:

```env
PUBLIC_URL=https://tma-production-a1b2.up.railway.app
```

Railway redeploys. On boot the server sees `PUBLIC_URL` and switches from long
polling to **webhook mode**, registering the webhook with Telegram itself and
protecting it with `BOT_WEBHOOK_SECRET`.

Check the deploy logs. A healthy start looks like:

```json
{"level":"info","msg":"redis_connected","queue":"tma-notifications"}
{"level":"info","msg":"worker_started","queue":"tma-notifications"}
{"level":"info","msg":"webhook_set","url":"https://tma-production-a1b2.up.railway.app/telegram/..."}
{"level":"info","msg":"server_started","port":3000,"notifications":"on"}
```

Verify from your own machine:

```bash
curl https://tma-production-a1b2.up.railway.app/health
```

**Important:** stop the local `npm run dev`. One bot token can only have one
active receiver. If a local instance is polling while Railway holds the webhook,
updates go missing.

---

## 6. Point the Mini App at the deployed API

Now that the API has a permanent HTTPS url, the tunnel is no longer needed.

```bash
cd E:\TMA\webapp
npx vercel env add VITE_API_URL production
# paste: https://tma-production-a1b2.up.railway.app   (no trailing slash)
npx vercel --prod
```

`VITE_*` variables are baked in at build time, so the redeploy is required.

Then set `WEBAPP_URL` on Railway to your Vercel domain so the bot's **Open TMA**
button appears, and add the same url in BotFather with `/setmenubutton`.

---

## 7. Verify end to end

| Check | Expected |
|---|---|
| `curl <railway-url>/health` | `{"ok":true,...}` |
| Bot `/start` | Asks for phone, then password |
| `+998935733108` and `TMBB1974` | Signs in |
| Bot `/plan` | Gemini builds a schedule in 10 to 30 seconds |
| Bot `/today` | Shows the schedule |
| Mini App from `/app` | Opens without asking for a password again |
| Vercel deployment protection | **Disabled**, or Telegram cannot load the app |

---

## Costs

| Service | Cost |
|---|---|
| Railway | $5 free credit per month, this service uses roughly $3 to $5 |
| Railway Redis | Counts against the same credit |
| Vercel | Free for a hobby project |
| Supabase | Free tier |
| Gemini | Pay per token. `gemini-3.1-pro-preview` has no free tier, so `AI_DAILY_CALL_LIMIT` is your spending cap |

To cut AI cost, set `MODEL_PLANNER=gemini-3-flash-preview`, which does have a
free tier.

---

## Updating after a code change

```bash
git add .
git commit -m "what changed"
git push
```

Railway rebuilds automatically. For the Mini App, `npx vercel --prod` from
`webapp/`.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails on `npm install` | Check the Railway build log for the failing package. Node 22 is used in the image |
| Build fails on `npm run build` with `error TS...` | A TypeScript error. The log lists `file(line,col)`. Reproduce locally with `npm run typecheck --workspace=server`, fix, commit, push |
| `Healthcheck failed` | The server did not reach `/health`. Almost always a missing variable; the log names it |
| Bot does not answer | `PUBLIC_URL` wrong or has a trailing slash, or a local instance is still polling |
| `redis_unavailable` in logs | The Redis service was not added, or `REDIS_URL` is not linked to the service |
| Mini App shows the setup screen | `VITE_API_URL` missing or the app was not redeployed after setting it |
| AI errors with quota | `AI_DAILY_CALL_LIMIT` reached, or Gemini billing is not enabled for the Pro model |
