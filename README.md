<div dir="rtl">

# 👑 ملوك العقارات – Property Kings

لعبة تجارة عقارات أونلاين جماعية (2–6 لاعبين) مستوحاة من ألعاب اللوح الكلاسيكية — بهوية بصرية وأسماء ومدن وكروت **أصلية بالكامل**، وقوانين اقتصاد متوازن: شراء وبناء ورهن ومزادات لحظية وتداول وتوقيف وإفلاس.

> ⚖️ هذا المشروع لا يستخدم اسم Monopoly أو شعاره أو تصميمه أو شخصياته أو أي محتوى محمي بحقوق ملكية — كل شيء هنا مرسوم ومكتوب من الصفر.

[المعمارية](#المعمارية) · [التشغيل المحلي](#التشغيل-المحلي) · [النشر المجاني](#النشر-المجاني) · [هيكل المشروع](#هيكل-المشروع) · [القواعد](#قواعد-اللعب) · [الاختبارات](#الاختبارات)

</div>

---

## ✨ المميزات

- 🎲 **نرد وحركة Server-Side**: النتيجة من `gen_random_bytes`، الحركة خطوة بخطوة مع أنيميشن Phaser 4.
- 🏗️ **اقتصاد كامل**: شراء، بناء 4 مستويات + معلم مميز، رهن/فك رهن بعلاوة، إيجارات تتضاعف مع المجموعة الكاملة.
- 🔨 **مزاد لحظي**: عدّاد يمتد عند المزايدات في اللحظات الأخيرة، وحسم تلقائي على السيرفر.
- 🤝 **تداول**: أموال + عقارات + بطاقات خروج، مع تحقق كامل من الملكية ووقت صلاحية.
- 🚔 **توقيف وإفلاس**: محاولات الزوجي، دفع/بطاقة خروج، تصفية قسرية ونقل ممتلكات للدائن.
- 🤖 **3 مستويات بوتات**: سهل/متوسط/صعب بمنطق نقي قابل للاختبار — لا يعرف معلومات مخفية.
- ⏱️ **مؤقت دور ذكي**: عند انتهاء الوقت ينفّذ السيرفر إجراءً آمنًا تلقائيًا (حتى لو غاب الجميع، عبر pg_cron).
- 🌍 **عربية RTL كاملة + إنجليزية LTR**، وضع داكن/فاتح، أصوات مولّدة برمجيًا، PWA قابلة للتثبيت.
- 🛡️ **أمان أولاً**: RLS على كل الجداول، دوال `SECURITY DEFINER` مع قفل الصفوف ومفاتيح Idempotency، وحماية من الغش وتكرار الحركات.

## 🧰 التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 |
| اللوحة | Phaser 4 (Client Component فقط) |
| الحالة | Zustand 5 (UI فقط) — الحالة الرسمية في PostgreSQL |
| الباك إند | Supabase Free: PostgreSQL + Auth (ضيف/OTP) + Realtime (Postgres Changes + Presence) + pg_cron |
| التحقق | Zod 4 للمدخلات في الواجهة، وقواعد صارمة داخل SQL |
| الاختبارات | Vitest 5 (وحدات + مكونات) · Playwright (E2E) |

## 🚀 التشغيل المحلي

### المتطلبات
- Node.js ≥ 20.9
- حساب Supabase مجاني (أو Supabase CLI للتشغيل المحلي الكامل)
- `npx supabase` CLI لمحاكاة الباك إند محليًا (اختياري)

### 1) إعداد Supabase (سحابي — الأسهل)
1. أنشئ مشروعًا جديدًا على [supabase.com](https://supabase.com) (الخطة المجانية).
2. من **Project Settings → API** انسخ `Project URL` و`anon public key`.
3. من تبويب **SQL Editor** نفّذ محتوى ملفات `supabase/migrations/*.sql` بالترتيب (0001 ثم 0002…) — أو استخدم Supabase CLI مع `supabase link` ثم `supabase db push`.
4. من **Authentication → Providers**: تأكد أن **Email** مفعّل، وفعّل **Anonymous sign-ins**.
5. (اختياري للـ Demo): نفّذ `supabase/seed.sql` من SQL Editor — ملاحظة: جزء الحسابات التجريبية يعمل محليًا فقط.

> عند التشغيل المحلي عبر CLI: `npx supabase start` ثم `npx supabase db push` ثم `npx supabase db reset` للـ seed. في الإعدادات المحلية يكون OTP في صندوق Inbucket على `http://127.0.0.1:54325`.

### 2) متغيرات البيئة
```bash
cp .env.example .env.local
# ثم عدّل القيم:
# NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

### 3) التشغيل
```bash
npm install
npm run dev          # http://localhost:3000
```

### الأوامر المتاحة
```bash
npm run dev          # خادم التطوير
npm run build        # بناء الإنتاج
npm run start        # تشغيل نسخة الإنتاج
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # اختبارات الوحدة والمكونات (Vitest)
npm run test:e2e     # اختبارات Playwright (تتطلب متصفحات: npx playwright install)
npm run icons        # إعادة توليد أيقونات PWA من الشعار
```

## 🚢 النشر المجاني

### Vercel
1. ارفع المستودع إلى GitHub ثم **Import Project** في Vercel.
2. أضف متغيرات البيئة `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. في Supabase → Authentication → URL Configuration أضف نطاق Vercel إلى `Site URL` و`Redirect URLs`.
4. Deploy — انتهى.

### Cloudflare Pages
- Build command: `npm run build` · Output: Next.js (Pages يكتشفه تلقائيًا عبر Vite preset/`@cloudflare/next-on-pages` للحالات المتقدمة — الأسهل استخدام Vercel).
- أضف نفس متغيري البيئة ثم اربط النطاق في إعدادات Supabase Auth.

### Self-hosting (اختياري)
```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... docker compose up --build
```
الواجهة في `http://localhost:3000`، والباك إند أي نسخة Supabase (سحابية أو [self-hosted](https://supabase.com/docs/guides/self-hosting)).

## 🗂️ هيكل المشروع

```
monopoly/
├─ src/
│  ├─ app/                    الصفحات: الرئيسية، الدخول، الغرف، Lobby، المباراة، النتائج، الملف، القواعد، الأدمن
│  ├─ components/
│  │  ├─ ui/                  أزرار، نوافذ، توست، أفاتار SVG أصلية، تبديل اللغة/الثيم/الصوت
│  │  ├─ game/                لوحة اللاعبين، شريط الإجراءات، المزاد، التداول، الدردشة، سجل الأحداث
│  │  └─ lobby/               مكونات غرفة الانتظار
│  ├─ game/
│  │  ├─ board.ts             بيانات اللوحة الأصلية (40 خانة: أسماء/أسعار/إيجارات/إحداثيات)
│  │  ├─ cards.ts             30 بطاقة أصلية (15 مفاجآت + 15 صندوق المدينة)
│  │  ├─ rules.ts             منطق القواعد المرجعي للواجهة (مرآة لدوال SQL)
│  │  ├─ types.ts             مخططات Zod للقطات (snapshots) + ألوان/قطع اللاعبين
│  │  └─ phaser/scene.ts      مشهد Phaser 4: الرسم، القطع، النرد، التمييزات، الكونفيتي
│  ├─ bots/
│  │  ├─ brain.ts             عقل البوتات (دوال نقية قابلة للاختبار)
│  │  └─ driver.ts            مشغّل البوتات (يعمل لدى المضيف عبر RPCs نفسها)
│  ├─ hooks/                  use-auth, use-room, use-game-room (Realtime/Presence/مهلات)
│  ├─ lib/                    supabase client, i18n (ar/en), sound (WebAudio), validation, utils
│  └─ stores/                 Zustand: ui-store (ثيم/صوت/توست) و game-store (لقطة/دردشة/حضور)
├─ supabase/
│  ├─ config.toml             إعداد CLI المحلي
│  ├─ migrations/0001..0009   الجداول + RLS + دوال المحرك + seed اللوحة والكروت والإنجازات
│  └─ seed.sql                بيانات Demo (حسابات + غرفة)
├─ public/                    manifest, sw.js, logo.svg, icons/
├─ tests/                     unit/ component/ e2e/
├─ scripts/generate-icons.mjs
├─ README.md · DEPLOYMENT.md · CONTRIBUTING.md · TECHNICAL_DECISIONS.md · LICENSE
```

## 🛡️ نظام Realtime

- **مصدر الحقيقة** دائمًا PostgreSQL؛ الواجهة تعرض لقطة `get_game_snapshot` وتحدّثها عبر **Postgres Changes** المفلترة بـ `game_id` مع RLS — أي أن كل عميل يرى فقط ما تسمح له سياسات الأمان.
- **Presence** عبر قناة `room-{id}` لحالة الاتصال فقط (متصل/غير متصل) — لا تُخزَّن حالة المباراة فيه إطلاقًا.
- **الدردشة** تصل عبر إدراج `chat_messages` (تُفلتر الكلمات وتُنظَّف من HTML على السيرفر).
- **إعادة الاتصال**: عند عودة القناة `SUBSCRIBED` تُجلب لقطة رسمية جديدة، والنبضة كل 20 ثانية تحفظ المقعد.
- **المهلات**: صفحة المباراة تكتشف تجاوز `turn_deadline_at` وتستدعي `handle_turn_timeout`، وأيضًا `fn_auto_tick` المجدولة عبر **pg_cron** كل 30 ثانية تنفّذ الإجراءات الافتراضية حتى لو أغلق الجميع المتصفحات.

## 🔐 RLS والأمان (ملخص)

- كل الجداول عليها RLS؛ الغرف: عامة/عضوية/أدمن، وبيانات المباراة: أعضاء الغرفة فقط.
- **لا يوجد أي INSERT/UPDATE مباشر** مسموح للعميل على جداول المباراة — كل شيء عبر دوال `SECURITY DEFINER` تتحقق من: الهوية → الانتماء → الدور → الطور → ثم تنفّذ داخل `FOR UPDATE` على صف المباراة.
- `game_cards` (ترتيب الـ deck) بلا أي سياسة قراءة — مخفي تمامًا عن العملاء.
- مفاتيح `idempotency` فريدة لكل حركة تمنع التكرار والضغط المزدوج وReplay.
- النرد عبر `gen_random_bytes` مع رفض التحيز؛ الرصيد لا يقبل السالب إلا داخل معالجة الإفلاس.
- الدردشة: تنظيف HTML + تطبيع عربي + فلتر كلمات محظور + Rate limit، والبلاغات تصل للأدمن.
- التفاصيل الكاملة والقرارات: [TECHNICAL_DECISIONS.md](./TECHNICAL_DECISIONS.md).

## 🎮 قواعد اللعب (الافتراضية)

| العنصر | القيمة الافتراضية | قابلة للتعديل في Lobby |
|---|---|---|
| رأس المال | 1500 د | ✅ 500–20000 |
| مكافأة البداية | 200 د لكل دورة | ✅ |
| وقت الدور | 60 ثانية | ✅ 15–300 |
| رسوم التوقيف | 50 د | ✅ |
| الرهن/فك الرهن | نصف السعر / +10% | ✅ |
| المباني قبل المعلم المميز | 4 (الخامس = 🏰) | ✅ 1–4 |
| المزادات | مفعّلة | ✅ |
| التداول | مفعّل | ✅ |
| شروط الفوز | آخر صامد / جولات / وقت / هدف ثروة | ✅ |

أوضاع اللعب: **كلاسيكي** (مباراة كاملة)، **سريع** (رأس مال أكبر + حد جولات/زمن)، **مخصص** (كل شيء).

## ➕ إضافة عقارات أو كروت جديدة

1. **عقار جديد**: أضف السطر في `src/game/board.ts` (مع `position` فريد 0..39) + السطر المطابق في `supabase/migrations/0007_seed_board.sql` (أو migration جديد). حدّث المجموعة في `GROUP_MEMBERS` تلقائيًا.
2. **بطاقة جديدة**: أضفها في `src/game/cards.ts` و`supabase/migrations/0008_seed_cards.sql` بنفس `effect_type` المدعومة، أو أضف نوعًا جديدًا في قيد `card_definitions.effect_type` وفي `fn_apply_card` ثم في `rules.ts`.
3. **قاعدة جديدة**: عدّل دوال SQL في migrations + مرآتها في `rules.ts` + حدّث الاختبارات في `tests/unit/rules.test.ts`.
4. نفّذ migrations على مشروعك ثم أعد تحميل اللعبة — اللوحة والكروت تُقرأ من SQL وقت إنشاء المباراة.

## 🧪 الاختبارات

```bash
npm run test        # 46 اختبار وحدة/مكونات: اللوحة، الكروت، الإيجار والبناء والرهن، البوتات، UI
npm run test:e2e    # Playwright: الرئيسية والقواعد (بلا DB) + تدفق مباراة كامل (يتطلب Supabase محليًا)
```
- اختبارات القواعد تراكم منطق الواجهة المرجعي مع دوال SQL (المصدر النهائي).
- اختبار E2E الكامل يحاكي لاعبين حقيقيين عبر Supabase المحلي — انظر التعليق داخل `tests/e2e/game-flow.spec.ts`.

## 👥 حسابات Demo (محليًا)

بعد `npx supabase db reset`:
- البريد `demo1@propertykings.local` وكلمة السر `demo1234` (التاجر-أول — مضيف غرفة `DEMO77`)
- البريد `demo2@propertykings.local` وكلمة السر `demo1234` (التاجر-الثاني)
- أو أنشئ حسابات ضيف بضغطة واحدة من صفحة الدخول.

## 🧑‍💻 إصلاح مشكلات شائعة

| المشكلة | الحل |
|---|---|
| "لم يتم إعداد Supabase" | عدّل `.env.local` وأعد تشغيل `npm run dev` |
| الرمز لا يصل للبريد | محليًا: افحص Inbucket `http://127.0.0.1:54325`؛ سحابيًا: تحقق من Spam |
| المزاد لا يُغلق | تأكد من تنفيذ migration 0003 (pg_cron) — أو أن أحد العملاء متصل فسيستدعي `finish_auction` |
| أزرار اللعب معطلة | تأكد أنك صاحب الدور وأن الطور مطابق — الأخطاء تظهر كتوست برمز الخطأ |

## 📄 الرخصة

MIT — انظر [LICENSE](./LICENSE). المساهمات مرحّب بها عبر [CONTRIBUTING.md](./CONTRIBUTING.md).
