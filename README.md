# TMA — Time Management Assistant

IELTS/SAT ga tayyorlanayotgan o'quvchi uchun kun tartibi assistenti:
Telegram bot + Telegram Mini App + Fastify backend + **Gemini** AI qatlami.

---

## 1. Kirish (login)

Bot **hech kimni** avtomatik ichiga kiritmaydi. `/start` bosilganda:

1. **Telefon raqami** so'raladi (matn yoki "Raqamimni yuborish" tugmasi orqali)
2. **Parol** so'raladi — parol xabari darhol o'chiriladi
3. Muvaffaqiyatli kirishda Telegram akkaunt `users.telegram_id` ga bog'lanadi

5 marta noto'g'ri parol → 15 daqiqaga bloklanadi. Chiqish: `/chiqish`.

**Yagona foydalanuvchi (Supabase da yaratilgan):**

| Maydon | Qiymat |
|---|---|
| Ism | Tojiddinov Muhammad |
| Telefon | `+998935733108` |
| Parol | `TMBB1974` |

Parol bazada ochiq saqlanmaydi — `bcrypt` ($2a$, 12 rounds) hash sifatida turadi.
Bazada boshqa foydalanuvchi yo'q va bot ro'yxatdan o'tkazmaydi.

---

## 2. AI qatlami — Gemini

| Vazifa | Model | Nega |
|---|---|---|
| Jadval generatsiyasi | `gemini-3.1-pro-preview` | Eng kuchli reasoning, ko'p cheklovli reja |
| Haftalik tahlil / hisobot | `gemini-3.1-pro-preview` | Uzun kontekst, chuqur xulosa |
| Oddiy chat | `gemini-3.6-flash` | Tez, barqaror (stable), arzon |
| Jadvalga kichik tahrir | `gemini-3.6-flash` | Yengil vazifa |
| Zaxira (fallback) | `gemini-3.5-flash` | Asosiy model javob bermasa |

Model ID'lari `.env` orqali sozlanadi (`MODEL_PLANNER`, `MODEL_CHAT`, …) —
kod o'zgartirmasdan almashtirish mumkin. Ro'yxat 2026-08 holatiga ko'ra
[Gemini models](https://ai.google.dev/gemini-api/docs/models) sahifasidan olingan.

Texnik tafsilotlar (`server/src/lib/ai.ts`):

- **Interactions API** ishlatiladi (`client.interactions.create`) — Google 2026-yil
  iyunidan buyon shuni tavsiya qiladi
- `thinking_level` har vazifa uchun alohida: og'ir rejalashtirishda `high`,
  chatda `low`
- **Temperature o'zgartirilmaydi** — Gemini 3 default `1.0` uchun sozlangan,
  pasaytirish looping va sifat pasayishiga olib keladi
- `store: false` — suhbat tarixi Google serverida saqlanmaydi, hammasi
  `ai_messages` jadvalida
- Structured output: `response_format: application/json` + **Zod** validatsiyasi;
  o'tmasa bir marta xatolar bilan qayta so'raladi
- **Bloklangan javob:** Gemini'da alohida "refusal" statusi yo'q — safety filtri
  ishlaganda javob bo'sh keladi. Shu holat aniqlanadi va avtomatik
  `gemini-3.5-flash` ga o'tiladi, foydalanuvchi xato ko'rmaydi
- Har chaqiruv `ai_usage` ga yoziladi, kunlik limit `AI_DAILY_CALL_LIMIT`

---

## 3. Lokalda ishga tushirish

### 3.1 Nima kerak

| Dastur | Versiya | Tekshirish |
|---|---|---|
| Node.js | **22 LTS tavsiya** (20 ham ishlaydi) | `node -v` |
| npm | 10+ | `npm -v` |
| Redis | 7+ (**ixtiyoriy**) | `redis-cli ping` → `PONG` |

Node yo'q bo'lsa yoki eski bo'lsa: <https://nodejs.org> dan **22 LTS** ni o'rnating.

Node 20 da `@supabase/supabase-js` native WebSocket topolmaydi — buning uchun kodda
`ws` paketi shim sifatida ulangan, ya'ni Node 20 da ham ishlaydi. Lekin Supabase
Node 20 ni deprecated deb ogohlantiradi, shuning uchun imkon bo'lsa 22 ga o'ting.

**Redis ixtiyoriy.** Uni o'rnatmasangiz ham bot, API va Mini App to'liq ishlaydi —
faqat **bildirishnomalar yuborilmaydi**. Server ishga tushganda buni logda ogohlantiradi:

```json
{"level":"warn","msg":"redis_unavailable", ...}
{"level":"warn","msg":"notifications_disabled", ...}
```

Bildirishnomalar kerak bo'lganda quyidagilardan birini tanlang:

| Yo'l | Buyruq |
|---|---|
| Docker Desktop | Avval Docker Desktop'ni oching (tray'da ishlab tursin), keyin:<br>`docker run -d --name tma-redis -p 6379:6379 redis:7-alpine` |
| Memurai (Windows uchun native) | <https://www.memurai.com/get-memurai> — Developer Edition bepul, Windows xizmati sifatida avtomatik ishlaydi |
| WSL2 | `wsl --install` → Ubuntu ichida:<br>`sudo apt install redis-server && sudo service redis-server start` |

Redis yoqilgandan keyin `npm run dev` ni qayta ishga tushiring — log
`redis_connected` va `worker_started` ga o'zgaradi.

Redis'ni ataylab o'chirish uchun `.env` da `REDIS_URL=` ni bo'sh qoldiring.

### 3.2 Paketlarni o'rnatish

Loyiha papkasida (`E:\TMA`) terminal oching:

```bash
npm install
```

Bu root, `server/` va `webapp/` ni birdan o'rnatadi (npm workspaces).

### 3.3 `.env` ni to'ldirish

`.env` fayli tayyor — BOT_TOKEN, GEMINI_API_KEY va Supabase kalitlari joyida.
Hech narsa o'zgartirish shart emas.

`.env` `.gitignore` da, ya'ni git ga tushmaydi. `service_role` kaliti **maxfiy** —
uni hech kimga bermang va frontend kodiga yozmang.

### 3.4 Ishga tushirish

Ikkita terminal kerak.

**1-terminal — backend + bot + worker + cron:**

```bash
npm run dev
```

Redis'siz (hozirgi holat) quyidagicha log chiqadi — bu **normal**:

```json
{"level":"warn","msg":"redis_unavailable","hint":"Bildirishnomalar o`chiq ishlaydi..."}
{"level":"warn","msg":"worker_not_started_no_redis"}
{"level":"info","msg":"bot_polling_started"}
{"level":"info","msg":"server_started","port":3000,"notifications":"off (Redis yo`q)"}
```

Redis bilan:

```json
{"level":"info","msg":"redis_connected","queue":"tma-notifications"}
{"level":"info","msg":"worker_started","queue":"tma-notifications"}
{"level":"info","msg":"bot_polling_started"}
{"level":"info","msg":"server_started","port":3000,"notifications":"on"}
```

**2-terminal — Mini App:**

```bash
npm run dev:web
```

→ <http://localhost:5173>

### 3.5 Botni sinash

Telegram'da botingizni oching va `/start` yuboring:

```
You:  /start
Bot:  send your phone number
You:  +998935733108
Bot:  Phone number accepted ✅  Now enter your password.
You:  TMBB1974
Bot:  Welcome back, Muhammad! ✅
```

Keyin:

- `/plan` - Gemini builds today's schedule (10 to 30 seconds)
- `/today` - see the schedule
- `/tomorrow`, `/report`, `/vocab`, `/settings`, `/pause`
- Or just write: _"I am tired today, shorten the evening blocks"_ ->
  the AI proposes a change, and it is applied only after you press **Apply**

> **Interface language is English.** Bot messages, buttons, the Mini App and the
> AI output are all in English. The code and comments are English too.

### 3.6 API ni to'g'ridan-to'g'ri tekshirish

```bash
curl http://localhost:3000/health
# {"ok":true,"ts":"2026-08-13T..."}
```

### 3.7 Mini App ni Telegram ichida ochish

Telegram Web App tugmasi **faqat HTTPS** manzilni qabul qiladi, `localhost` ishlamaydi.
Ikki yo'l bor.

#### Variant 1 — tunnel (tez, sinash uchun)

Uchinchi terminalda:

```bash
npx localtunnel --port 5173
# yoki: ngrok http 5173
```

Chiqqan HTTPS manzilni `.env` dagi `WEBAPP_URL` ga yozing va serverni qayta
ishga tushiring. Tunnel yopilsa manzil o'zgaradi.

#### Variant 2 — Vercel'ga yuklash (doimiy manzil)

**1-qadam. Mini App'ni yuklang.**

```bash
cd E:\TMA\webapp
npx vercel login      # brauzerda hisobingizga kiring
npx vercel            # birinchi marta — savollarga javob bering
```

Savollarga javoblar:

| Savol | Javob |
|---|---|
| Set up and deploy? | `y` |
| Which scope? | o'z hisobingiz |
| Link to existing project? | `n` |
| Project name? | `tma` (yoki xohlagan nom) |
| In which directory is your code? | `./` (siz allaqachon `webapp` ichidasiz) |
| Modify settings? | `n` — `vercel.json` allaqachon sozlangan |

**2-qadam. Backend'ni HTTPS ga chiqaring.** Vercel'dagi sayt sizning
kompyuteringizdagi `localhost:3000` ga ulana olmaydi, shuning uchun backend uchun
ham tunnel kerak. Alohida terminalda:

```bash
npx localtunnel --port 3000
# masalan: https://tma-api.loca.lt
```

**3-qadam. Vercel'ga API manzilini bering.**

```bash
npx vercel env add VITE_API_URL production
# so'raganda backend tunnel manzilini kiriting (oxirida / QO'YMANG)
npx vercel --prod
```

Yoki brauzerda: Vercel Dashboard → loyiha → Settings → Environment Variables.

> `VITE_*` o'zgaruvchilar **build vaqtida** kodga yoziladi, shuning uchun har
> o'zgartirishdan keyin qayta deploy qilish shart (`npx vercel --prod`).

**4-qadam. Botni Vercel manziliga ulang.**

`.env` da:

```env
WEBAPP_URL=https://tma-xxxx.vercel.app
```

Serverni qayta ishga tushiring. Endi `/app` bosilganda tugma chiqadi.

BotFather orqali doimiy menyu tugmasi ham qo'shishingiz mumkin:
`/setmenubutton` → botni tanlang → shu URL.

> **Diqqat:** backend kompyuteringizda ishlagani uchun kompyuter o'chsa yoki
> tunnel yopilsa Mini App ma'lumot ko'rsatmaydi. Doimiy yechim uchun backend'ni
> Railway / Fly.io / VPS ga qo'ying (bot uzluksiz ishlashi kerak, shuning uchun
> Vercel serverless backend uchun to'g'ri kelmaydi).

### 3.8 Tez-tez uchraydigan muammolar

| Xato | Sabab va yechim |
|---|---|
| `❌ .env noto'g'ri sozlangan` | `.env` da majburiy maydon bo'sh. Log qaysi maydon ekanini aytadi |
| `redis_unavailable` warn | Redis yo'q — bu **xato emas**. Bot ishlaydi, bildirishnomalar o'chiq |
| `401 Unauthorized` (Supabase) | `SUPABASE_SERVICE_ROLE_KEY` noto'g'ri yoki bo'sh |
| Bot javob bermayapti | `BOT_TOKEN` xato, yoki bot boshqa joyda ishlab turibdi (bir token = bitta polling) |
| `native WebSocket not found` | Node 20 da bo'ladi. `npm install` ni qayta yurgizing (`ws` paketi qo'shildi), yoki Node 22 ga o'ting |
| `GEMINI_API_KEY sozlanmagan` | `.env` dagi kalit bo'sh yoki eskirgan |
| AI javobi kelmadi | Kunlik limit (`AI_DAILY_CALL_LIMIT=60`) tugagan bo'lishi mumkin |

### 3.9 Foydali buyruqlar

```bash
npm run typecheck     # TypeScript xatolarini tekshirish (birinchi ishga tushirishdan oldin)
npm run build         # server + webapp ni build qilish
npm start             # production rejimida ishga tushirish
```

---

## 4. Deploying

Local development is covered above. For production see **[DEPLOY.md](DEPLOY.md)**:
the backend goes to Railway (Dockerfile and `railway.json` are in the repo), the
Mini App to Vercel.

---

## 5. Supabase

Loyiha: **TMA** — `https://tdbrdyhfavwadcsotwsj.supabase.co`

13 jadval, barchasida RLS yoqilgan. Backend `service_role` kaliti bilan ishlaydi,
har foydalanuvchi tekshiruvi servis qatlamida bajariladi.
Migratsiyalar `supabase/migrations/` da (loyihaga allaqachon qo'llangan).

---

## 6. Struktura

```
server/src/
  config/env.ts          .env validatsiyasi (Zod)
  config/models.ts       Gemini model routing + thinking_level
  lib/ai.ts              Gemini wrapper: Interactions API, fallback, JSON + Zod retry
  lib/auth.ts            telefon+parol login, sessiya, app token
  lib/schemas.ts         Zod sxemalar + jadval ustma-ustlik tekshiruvi
  lib/time.ts            Luxon, Asia/Tashkent
  services/
    schedules.ts         jadval CRUD, progress, streak
    context.ts           AI ga beriladigan kontekst (profil, imtihon, 7 kun stat)
    planner.ts           jadval generatsiyasi, pending_changes, chat
    recovery.ts          "2 soat orqadasiz" → kunni qayta taqsimlash
    reports.ts           haftalik tahlil, xatolar naqshi, charchoq nazorati
    vocab.ts             SM-2 spaced repetition
    ics.ts               .ics eksport
    call-provider.ts     CallProvider interfeysi (none | twilio)
    daily-cron.ts        10 daqiqalik va soatlik tiklar
  queue/                 BullMQ: delayed joblar, idempotent jobId, wake eskalatsiya
  bot/                   grammY: auth gate → buyruqlar → callbacklar
  api/routes.ts          Fastify REST + Mini App initData verification
webapp/src/
  screens/               Login, Today, Calendar, Chat, Reports, Settings
```

---

## 7. Muhim qoidalar

- **AI hech qachon jadvalni to'g'ridan-to'g'ri o'zgartirmaydi.** Har tahrir
  `pending_changes` ga yoziladi va faqat "✅ Roziman" bosilgandan keyin qo'llanadi.
- **Qulflangan bloklar** (`locked = true`) AI uchun daxlsiz.
- **Idempotentlik:** har blok bildirishnomasi deterministik `jobId` bilan qo'yiladi,
  shuning uchun bir blok uchun ikki marta xabar ketmaydi.
- API kalitlari faqat `.env` da. `.env` git ga tushmaydi (`.gitignore`).

---

## 8. Bosqichlar holati

| Bosqich | Holat |
|---|---|
| 1 — Asos (bot, DB, bildirishnomalar) | ✅ |
| 2 — AI (generatsiya, chat, Roziman oqimi) | ✅ |
| 3 — Mini App (5 ekran) | ✅ |
| 4 — Xatolar daftari, vocab SRS, focus xaritasi, recovery | ✅ |
| 5 — Haqiqiy qo'ng'iroq | interfeys tayyor, provayder ulanmagan (`CALL_PROVIDER=none`) |

Telegram bot API telefon qo'ng'irog'i qila olmaydi — Bosqich 1–4 da
**Variant A** (Telegram eskalatsiyasi: 5 xabar, 2 daqiqadan, 3-chisida ovozli xabar)
ishlatiladi. Haqiqiy qo'ng'iroq uchun `.env` da `CALL_PROVIDER=twilio` va Twilio
kalitlarini to'ldiring.
