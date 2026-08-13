# Mini App'ni Vercel'ga deploy qilish

Bu qo'llanma faqat `webapp/` papkasi haqida. Backend (bot + API) Railway'da,
u haqida [DEPLOY.md](DEPLOY.md) da yozilgan.

---

## 0. Oldindan bilish kerak

Vercel'da **Root Directory** ni `webapp` qilib belgilash shart. Aks holda Vercel
loyiha ildizidan build qilmoqchi bo'ladi va u yerda backend kodi turadi.

Ikkinchi muhim narsa: `VITE_API_URL` **build vaqtida** kodga yoziladi. Ya'ni uni
o'zgartirsangiz, qayta deploy qilish shart. Faqat saqlash yetarli emas.

---

## 1. Eski ulanishni tozalash (agar boshqa hisobga o'tayotgan bo'lsangiz)

Ilgari `npx vercel` ishlatgan bo'lsangiz, `webapp/.vercel` papkasida eski
loyihaga havola saqlangan. Yangi hisobga o'tishdan oldin uni o'chiring:

```powershell
Remove-Item -Recurse -Force E:\TMA\webapp\.vercel
```

Bu papka `.gitignore` da, GitHub'ga tushmagan.

---

## 2. Vercel'ga kirish

<https://vercel.com> ni oching va **kodingiz turgan GitHub hisobi bilan** kiring.
Boshqa hisob bilan kirsangiz, import ro'yxatida repozitoriya ko'rinmaydi.

---

## 3. Loyihani import qilish

1. **Add New** → **Project**
2. **Import Git Repository** bo'limida `tma` reposini toping → **Import**
3. Repo ko'rinmasa: **Adjust GitHub App Permissions** → Vercel'ga shu repoga
   ruxsat bering

---

## 4. Sozlamalar (eng muhim ekran)

Import'dan keyin konfiguratsiya ekrani chiqadi:

| Maydon | Qiymat |
|---|---|
| **Root Directory** | `webapp` ← **Edit** bosib o'zgartiring, bu majburiy |
| Framework Preset | `Vite` (avtomatik aniqlanadi) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Include files outside Root Directory | **o'chiq** qolsin |

Build va Output qiymatlari `webapp/vercel.json` da allaqachon yozilgan, shuning
uchun ularga tegmasangiz ham bo'ladi.

---

## 5. Environment Variables

Shu ekranning pastida **Environment Variables** bo'limi bor. Bittasini qo'shing:

| Name | Value |
|---|---|
| `VITE_API_URL` | Railway domeningiz, masalan `https://tma-production-a1b2.up.railway.app` |

Oxirida `/` **qo'ymang**.

Railway domeni hali yo'q bo'lsa, bu qadamni tashlab ketib, keyin 8-bo'limdagi
yo'l bilan qo'shishingiz mumkin.

---

## 6. Deploy

**Deploy** ni bosing. 1-2 daqiqada tayyor bo'ladi va domen beriladi:
`tma-xxxx.vercel.app`.

---

## 7. ⚠️ Deployment Protection ni o'chirish

Sukut bo'yicha Vercel loyihani parol bilan yopadi va Telegram uni ocholmaydi.

**Settings** → **Deployment Protection** → *Vercel Authentication* → **Disabled**
→ **Save**.

Tekshirish: domeningizni brauzerning **yashirin oynasida** oching. Vercel login
sahifasi o'rniga ilova chiqsa — tayyor.

---

## 8. `VITE_API_URL` ni keyin qo'shish yoki o'zgartirish

**Settings** → **Environment Variables** → **Add New**:

- Key: `VITE_API_URL`
- Value: Railway domeni
- Environment: **Production** (xohlasangiz Preview ham)

Keyin **Deployments** → oxirgi deploy → `...` menyusi → **Redeploy**.
Qayta deploy qilmasangiz o'zgarish kuchga kirmaydi.

CLI orqali xohlasangiz:

```powershell
cd E:\TMA\webapp
npx vercel env add VITE_API_URL production
npx vercel --prod
```

---

## 9. Botga ulash

Vercel domeni tayyor bo'lgach:

1. **Railway** → `tma` servisi → Variables → `WEBAPP_URL` ni Vercel domeniga
   o'zgartiring. Shundan keyin botdagi `/app` da tugma paydo bo'ladi
2. **BotFather** → `/setmenubutton` → botni tanlang → shu URL ni bering. Bu
   Telegram'dagi doimiy menyu tugmasi

---

## 10. Tekshirish

| Tekshiruv | Kutilgan natija |
|---|---|
| Domen yashirin oynada ochiladi | Ilova chiqadi, Vercel login emas |
| Botda `/app` | "Open TMA" tugmasi chiqadi |
| Tugmani bosish | Ilova Telegram ichida ochiladi |
| Ilova ochilishi | Parol so'ramaydi (botdagi sessiya taniladi) |
| Bugungi ekran | Jadval ko'rinadi, "Cannot reach the server" emas |

"Cannot reach the server" chiqsa — `VITE_API_URL` yo'q yoki qayta deploy
qilinmagan. Ilovaning o'zi shu ekranda nima yetishmayotganini yozib beradi.

---

## 11. Keyingi o'zgarishlar

GitHub'dan import qilingani uchun endi alohida buyruq kerak emas:

```powershell
git add .
git commit -m "nima o'zgardi"
git push
```

Vercel `webapp/` o'zgarganini ko'rib avtomatik qayta quradi. Railway ham shu
push'dan backend'ni qayta quradi.

---

## Tez-tez uchraydigan muammolar

| Muammo | Sabab va yechim |
|---|---|
| Build xatosi: `Could not resolve entry` | Root Directory `webapp` qilib belgilanmagan |
| Sayt ochilganda Vercel login | Deployment Protection yoqilgan, 7-bo'limga qarang |
| "Cannot reach the server" | `VITE_API_URL` yo'q yoki qo'shilgandan keyin qayta deploy qilinmagan |
| Telegram tugmani ko'rsatmaydi | Railway'dagi `WEBAPP_URL` hali eski yoki `http://` bilan |
| Repo import ro'yxatida yo'q | Vercel'ga boshqa GitHub hisobi bilan kirgansiz |
