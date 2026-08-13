# Git va GitHub — batafsil qo'llanma

Bu qo'llanma o'zbek tilida, chunki bu siz uchun yo'riqnoma. Ilovaning o'zi
(bot, tugmalar, Mini App) to'liq ingliz tilida.

---

## 0. Nega git kerak?

Railway kodni **GitHub repozitoriyasidan** oladi. Ya'ni:

```
Sizning kompyuteringiz  →  git push  →  GitHub  →  avtomatik  →  Railway
```

Bir marta sozlab olsangiz, keyin har o'zgarishda faqat `git push` yozasiz —
Railway o'zi qayta quradi va deploy qiladi.

---

## 1. Git o'rnatilganmi?

PowerShell yoki CMD oching:

```bash
git --version
```

`git version 2.4x.x` chiqsa — bor. Xato chiqsa <https://git-scm.com/download/win>
dan yuklab o'rnating (hamma savolga "Next", standart sozlamalar to'g'ri).

O'rnatgandan keyin terminalni **yopib qayta oching**, aks holda `git` topilmaydi.

---

## 2. Git'ni bir marta sozlash

Bu ma'lumot har commit'ga yoziladi:

```bash
git config --global user.name "Muhammad Tojiddinov"
git config --global user.email "tojiddinovmuhammad7274@gmail.com"
```

Windows'da qator oxiri belgisi muammosini oldini olish uchun:

```bash
git config --global core.autocrlf true
```

Tekshirish:

```bash
git config --global --list
```

---

## 3. Loyihada git'ni boshlash

```bash
cd E:\TMA
git init
```

`Initialized empty Git repository...` chiqadi. Endi `E:\TMA\.git` papkasi paydo
bo'ldi — bu git'ning ichki ma'lumotlari, unga tegmang.

---

## 4. ⚠️ ENG MUHIM QADAM: maxfiy fayllarni tekshirish

`.env` faylida **haqiqiy kalitlar** bor: bot tokeni, Supabase service_role,
Gemini kaliti. Ular GitHub'ga tushmasligi kerak.

`.gitignore` allaqachon sozlangan. Tekshiring:

```bash
git status
```

Chiqqan ro'yxatda **`.env` bo'lmasligi kerak**. Faqat `.env.example` bo'lishi
mumkin.

Yana bir tekshiruv:

```bash
git check-ignore -v .env
```

`.gitignore:9:.env    .env` ko'rinishida javob chiqsa — hammasi joyida,
fayl e'tiborga olinmaydi.

Agar `.env` `git status` da ko'rinsa — **to'xtang** va menga ayting.

---

## 5. Birinchi commit

```bash
git add .
git commit -m "TMA: Telegram bot, API and Mini App"
```

`git add .` — barcha fayllarni "sahnaga" qo'yadi (`.gitignore` dagilardan
tashqari).
`git commit -m "..."` — o'zgarishlarni tarixga yozadi. Xabar qisqa va aniq
bo'lsin.

Nima commit qilinganini ko'rish:

```bash
git log --oneline
git show --stat --name-only HEAD | head -40
```

Bu ro'yxatda `.env` bo'lmasligini yana bir bor tasdiqlang.

---

## 6. GitHub'da repozitoriya yaratish

1. <https://github.com/new> ni oching
2. **Repository name:** `tma`
3. **Description:** ixtiyoriy
4. **Private** ni tanlang (Public emas — bu shaxsiy loyiha)
5. Quyidagi uchtasini **belgilamang**: Add a README, .gitignore, license.
   Bizda ular allaqachon bor, belgilasangiz konflikt chiqadi
6. **Create repository**

Ochilgan sahifada `https://github.com/<username>/tma.git` manzilini nusxalang.

---

## 7. GitHub'ga ulash va yuborish

```bash
git remote add origin https://github.com/<username>/tma.git
git branch -M main
git push -u origin main
```

`<username>` ni o'z GitHub nomingizga almashtiring.

Buyruqlar nima qiladi:

| Buyruq | Ma'nosi |
|---|---|
| `remote add origin ...` | "origin" nomi bilan GitHub manzilini eslab qoladi |
| `branch -M main` | Asosiy tarmoq nomini `main` qiladi (GitHub standarti) |
| `push -u origin main` | Kodni yuboradi va bu tarmoqni standart qilib belgilaydi |

---

## 8. Autentifikatsiya (parol so'ralganda)

GitHub 2021-yildan beri **oddiy parolni qabul qilmaydi**. Ikki yo'l bor.

### Yo'l A — Git Credential Manager (eng oson)

Windows uchun Git bilan birga keladi. `git push` yozganingizda brauzer ochiladi,
GitHub hisobingizga kirasiz, tamom. Keyingi safar so'ramaydi.

### Yo'l B — Personal Access Token

Agar brauzer ochilmasa:

1. <https://github.com/settings/tokens> → **Generate new token (classic)**
2. **Note:** `tma-deploy`
3. **Expiration:** 90 days (yoki No expiration)
4. **Scopes:** faqat `repo` ni belgilang
5. **Generate token** → chiqqan qatorni nusxalang (**bir marta ko'rsatiladi**)

`git push` parol so'raganda:

- **Username:** GitHub username'ingiz
- **Password:** parol emas, **token** ni qo'ying

Tokenni saqlab qo'yish uchun:

```bash
git config --global credential.helper manager
```

---

## 9. Keyingi o'zgarishlar

Kodda biror narsa o'zgartirdingiz. Uch buyruq:

```bash
git add .
git commit -m "nima o'zgardi"
git push
```

Shu paytdayoq Railway o'zi yangi build boshlaydi.

Commit xabari yaxshi bo'lsin — bu kelajakdagi o'zingiz uchun:

```bash
git commit -m "Fix wake-up escalation timing"      # yaxshi
git commit -m "update"                              # yomon
```

Nima o'zgarganini push'dan oldin ko'rish:

```bash
git status              # qaysi fayllar o'zgargan
git diff                # aniq nima o'zgargan
git diff --stat         # qisqacha xulosa
```

---

## 10. Agar `.env` xato bilan commit qilinsa

Bu jiddiy — kalitlaringiz GitHub tarixida qoladi.

**1-qadam.** Faylni git'dan chiqaring (diskda qoladi):

```bash
git rm --cached .env
git commit -m "Remove .env from version control"
git push
```

**2-qadam.** Agar allaqachon GitHub'ga push qilingan bo'lsa, **barcha kalitlarni
almashtiring**. Fayl tarixdan o'chirilsa ham, uni ko'rgan odam bo'lishi mumkin:

| Kalit | Qayerdan yangilanadi |
|---|---|
| Bot tokeni | BotFather → `/revoke` → yangi token |
| Supabase service_role | Dashboard → Settings → API → Rotate |
| Gemini kaliti | <https://aistudio.google.com/apikey> → eskisini o'chirib, yangi yarating |

---

## 11. Foydali buyruqlar

```bash
git log --oneline -10           # oxirgi 10 commit
git log --oneline --graph       # tarmoqlar bilan
git show HEAD                   # oxirgi commit tafsiloti
git restore <fayl>              # faylni oxirgi commit holatiga qaytarish
git restore --staged <fayl>     # `git add` ni bekor qilish
git remote -v                   # qaysi GitHub manziliga ulangan
```

Oxirgi commit xabarini tuzatish (hali push qilinmagan bo'lsa):

```bash
git commit --amend -m "yangi xabar"
```

---

## 12. Nima commit qilinadi, nima yo'q

| Commit qilinadi ✅ | Qilinmaydi ❌ |
|---|---|
| `server/src/**`, `webapp/src/**` | `node_modules/` (juda katta, `npm install` tiklaydi) |
| `package.json`, `package-lock.json` | `dist/` (build natijasi) |
| `Dockerfile`, `railway.json`, `vercel.json` | `.env` (maxfiy kalitlar) |
| `supabase/migrations/**` | `.vercel/` (lokal deploy holati) |
| `README.md`, `DEPLOY.md`, `.env.example` | `*.log` |

`package-lock.json` ni albatta commit qiling — u paketlarning aniq
versiyalarini qulflaydi, shunda Railway'dagi build sizning kompyuteringizdagi
bilan bir xil bo'ladi.

---

## 13. Ikkinchi GitHub akkauntga ham push qilish

Xuddi shu kodni ikkita hisobga yuborish mumkin. Bitta papka, ikkita manzil.

### 13.1 Avval: ikkinchi hisobda repo yarating

Ikkinchi akkauntga kiring va `github.com/new` dan `tma` nomli **Private** repo
yarating. Ichini bo'sh qoldiring (README, .gitignore belgilamang).

### 13.2 Bir mashinada ikkita hisob muammosi

Windows Credential Manager `github.com` uchun **bitta** parolni saqlaydi. Shuning
uchun ikkinchi hisobga push qilganda birinchisining ma'lumoti ishlatiladi va
`403 Permission denied` chiqadi.

Yechim — har repo uchun alohida kirish ma'lumoti saqlansin:

```bash
git config --global credential.useHttpPath true
```

Bu bir marta bajariladi. Shundan keyin git `github.com/TMB-king/tma` va
`github.com/theanvarovich/tma` uchun ikki xil hisobni eslab qoladi.

Qo'shimcha: remote manzilida foydalanuvchi nomini ko'rsating (`user@github.com`),
shunda git qaysi hisob kerakligini so'ramasdan biladi.

### 13.3 Variant A — alohida remote (tavsiya)

Har biriga alohida nom beriladi, alohida push qilinadi:

```bash
git remote add backup https://theanvarovich@github.com/theanvarovich/tma.git

git push origin main     # birinchi hisobga
git push backup main     # ikkinchi hisobga
```

Tekshirish:

```bash
git remote -v
```

Afzalligi: har biriga alohida, xohlagan paytda yuborasiz. Masalan `origin` ga
har kuni, `backup` ga haftada bir marta.

### 13.4 Variant B — bitta buyruq bilan ikkalasiga

`origin` ga ikkita push manzili biriktiriladi:

```bash
git remote set-url --add --push origin https://TMB-king@github.com/TMB-king/tma.git
git remote set-url --add --push origin https://theanvarovich@github.com/theanvarovich/tma.git

git push origin main     # ikkalasiga birdan ketadi
```

**Diqqat:** `--add --push` birinchi marta ishlatilganda standart push manzilini
almashtiradi, shuning uchun **ikkala** manzilni ham qo'shish shart. Birinchisini
qo'shishni unutsangiz, faqat ikkinchisiga ketadi.

Tekshirish:

```bash
git remote -v
# origin  https://...TMB-king/tma.git (fetch)
# origin  https://...TMB-king/tma.git (push)
# origin  https://...theanvarovich/tma.git (push)
```

`git pull` esa faqat birinchi (fetch) manzildan tortadi — bu normal.

### 13.5 Agar maqsad hamkorlik bo'lsa

Ikkinchi akkaunt boshqa odamniki bo'lsa va u ham kod ustida ishlasa, nusxa
ko'chirishdan ko'ra uni **collaborator** qilib qo'shish to'g'riroq:

Repo → **Settings** → **Collaborators** → **Add people** → uning username'i.

Shunda ikkalangiz bitta repo bilan ishlaysiz, tarix bo'linib ketmaydi va
o'zgarishlar bir joyda to'planadi.

### 13.6 Railway va Vercel haqida

Ikkinchi GitHub repo — bu faqat kodning nusxasi. U **avtomatik deploy
qilmaydi**. Ikkinchi ishlaydigan nusxa kerak bo'lsa, u alohida bot tokeni talab
qiladi: bitta tokenni ikkita serverda ishlatib bo'lmaydi, ikkinchisi
birinchisining webhook'ini o'chirib yuboradi.

---

## Keyingi qadam

Kod GitHub'da bo'lgach, **[DEPLOY.md](DEPLOY.md)** ning 2-qadamiga o'ting:
Railway loyihasini yaratish.
