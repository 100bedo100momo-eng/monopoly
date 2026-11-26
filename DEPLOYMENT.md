<div dir="rtl">

# 🚢 دليل النشر – Property Kings

</div>

## نظرة عامة

| الهدف | الطريقة | التكلفة |
|---|---|---|
| الواجهة | Vercel Hobby (أو Cloudflare Pages) | مجاني |
| الباك إند | Supabase Free | مجاني |
| Self-host | docker-compose + أي Supabase | اختياري |

## 1) Supabase (الخطة المجانية)

1. أنشئ مشروعًا في [supabase.com](https://supabase.com) (Region الأقرب: `Frankfurt` أو `Flynn`).
2. **SQL Editor** → نفّذ الملفات بالترتيب: `0001_schema.sql` … `0009_achievements.sql`.
   - أو عبر CLI: `npx supabase login` → `npx supabase link --project-ref REF` → `supabase db push`.
3. **Authentication → Sign In / Up**:
   - فعّل **Email provider**.
   - فعّل **Anonymous sign-ins** (للدخول كضيف بضغطة).
   - Magic Link / OTP مفعّل تلقائيًا مع Email.
4. **Authentication → URL Configuration**:
   - `Site URL`: نطاق الإنتاج (مثل `https://your-app.vercel.app`).
   - `Redirect URLs`: أضف النطاق + `http://localhost:3000` للتطوير.
5. **Realtime**: مفعّل افتراضيًا — لا حاجة لإعدادات إضافية؛ الحساسيات عبر RLS.
6. (اختياري) `supabase/seed.sql` من SQL Editor للغرفة التجريبية — حسابات الـ Demo تعمل في المحلي فقط.

> **pg_cron**: migration 0003 يفعّل الامتداد ويجدول `fn_auto_tick` كل 30 ثانية لمعالجة المهلات والمزادات حتى لو أغلق الجميع المتصفح. على الاستضافة السحابية يظهر تحت `Database → Extensions/Cron`.

## 2) Vercel (الأسهل)

1. Push للمستودع إلى GitHub.
2. [vercel.com/new](https://vercel.com/new) → استورد المستودع.
3. Framework: Next.js (يُكتشف تلقائيًا). لا حاجة لتغيير Build Command.
4. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy. بعدها أضف نطاق Vercel في Supabase Auth URLs (خطوة 4 أعلاه) حتى يعمل OTP والعودة للنطاق الصحيح.
6. كل Push على `main` ينشر تلقائيًا؛ PRs تحصل على Preview URLs.

## 3) Cloudflare Pages (بديل)

1. Workers & Pages → Create → Pages → Connect to Git.
2. Build command: `npx @cloudflare/next-on-pages@1`، Output: `.vercel/output/static`.
3. نفس متغيري البيئة + `NODE_VERSION=20`.
4. ملاحظة: Next.js على Cloudflare يستخدم runtime حافة — إن ظهرت مشاكل توافق مع Phaser/SSR استخدم Vercel أو Node runtime.

## 4) Self-host عبر Docker

```bash
# 1) جهّز Supabase (سحابي أو self-hosted: https://supabase.com/docs/guides/self-hosting)
# 2) نفّذ migrations ثم:
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
docker compose up --build -d
# الواجهة: http://localhost:3000
```
ملف `docker-compose.yml` يشغّل Next.js standalone على منفذ 3000.

## 5) Post-Deploy Checklist

- [ ] الموقع يفتح بالعربية RTL والتبديل للإنجليزية يعمل ويُحفظ.
- [ ] الدخول كضيف يُنشئ profile وينتقل للغرف.
- [ ] إنشاء غرفة + غرفة ثانية من متصفح آخر + بدء مباراة.
- [ ] النرد يحرك القطعة عبر Phaser والحركة خطوة بخطوة.
- [ ] المزاد يفتح عند الرفض ويسدده تلقائيًا بعد العدّاد.
- [ ] الدردشة تعمل والفلتر يحجب الكلمات المحظورة.
- [ ] `npm run lint && npm run typecheck && npm run test` كلها خضراء.
- [ ] PWA: تثبيت من المتصفح يعمل وأيقونة الـ crown تظهر.
- [ ] (محلي فقط) `npx supabase db reset` يجيب Demo: `DEMO77` وحسابات التجار.

## استكشاف الأخطاء

| الحالة | السبب الشائع | الحل |
|---|---|---|
| توست `CONFIG_MISSING` | متغيرات البيئة ناقصة | تحقق من .env في Vercel ثم Redeploy |
| OTP لا يصل | نطاق غير مسموح | أضف النطاق في Redirect URLs |
| لا أحد يتحرك | Realtime معطل | تحقق من أن `realtime` enabled وأن RLS policies من 0002 مطبقة |
| مزاد عالق | pg_cron غير مفعل | نفّذ 0003؛ وإن وجد لاعب متصل سيغلق المزاد واجهته |
| خطأ 500 في RPC | migration ناقص | نفّذ كل الملفات بالترتيب |
