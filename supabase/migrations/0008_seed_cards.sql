-- ============================================================
-- 0008: الكروت الأصلية — 30 بطاقة (15 مفاجآت + 15 صندوق المدينة)
-- مطابقة لـ src/game/cards.ts
-- ============================================================

insert into public.card_definitions
  (id, deck, title_ar, title_en, description_ar, description_en, effect_type, effect_value, target_tile, icon, sort_order) values
  -- ============ مفاجآت ============
  ('sp-01','surprise','انطلاقة جديدة','Fresh Start','انتقل إلى نقطة البداية واحصل على مكافأة الدوران.','Advance to Start and collect the passing bonus.','move_to',0,'start','🏁',1),
  ('sp-02','surprise','مطاردة المفتش','Inspector Chase','اذهب إلى التوقيف فورًا. لا تمرّ على البداية.','Go directly to Detention. Do not pass Start.','go_to_detention',0,null,'🚨',2),
  ('sp-03','surprise','بطاقة عطف','Card of Mercy','احتفظ بهذه البطاقة للخروج من التوقيف مجانًا.','Keep this card to exit Detention for free.','grant_exit_card',1,null,'🎟️',3),
  ('sp-04','surprise','استثمار موفق','Winning Investment','عوائد مشروعك الصغير: استلم 150 درهمًا.','Your side project paid off: collect 150 dirhams.','gain',150,null,'📈',4),
  ('sp-05','surprise','غرامة وقوف','Parking Fine','وقفت سيارتك في مكان غير نظامي: ادفع 100 درهم.','Illegal parking fine: pay 100 dirhams.','loss',100,null,'🚗',5),
  ('sp-06','surprise','رحلة العمل','Business Trip','تقدّم إلى أقرب محطة نقل وادفع الأجرة المقررة إن كانت مملوكة.','Advance to the nearest transport hub and pay rent if owned.','move_to_nearest_hub',0,null,'🚉',6),
  ('sp-07','surprise','عاصفة رملية','Sandstorm','اعصار رجلك ثلاث خانات إلى الخلف.','Move back 3 tiles.','move_back',3,null,'🌪️',7),
  ('sp-08','surprise','دعوة حفل','Party Invitation','تقدّم إلى حي بورسعيد — المدينة الساحرة.','Advance to Port Said.','move_to',0,'port-said','🎉',8),
  ('sp-09','surprise','فاتورة صيانة','Maintenance Bill','صيانة طارئة لمقر شركتك: ادفع 150 درهمًا.','Emergency office maintenance: pay 150 dirhams.','loss',150,null,'🧾',9),
  ('sp-10','surprise','جائزة العمارة','Architecture Prize','فاز تصميمك بجائزة المدينة: استلم 100 درهم.','Your design won the city prize: collect 100 dirhams.','gain',100,null,'🏆',10),
  ('sp-11','surprise','شريك سخي','Generous Partner','كل لاعب يديك 50 درهمًا احتفاءً بشراكتكم.','Each player pays you 50 dirhams.','collect_from_each',50,null,'🤝',11),
  ('sp-12','surprise','استرداد تأمين','Refund','استلمت تأمين الإيجار القديم: 200 درهم.','Old rent deposit refunded: collect 200 dirhams.','gain',200,null,'💰',12),
  ('sp-13','surprise','طريق مختصر','Shortcut','استلم بطاقة خروج مجانية من التوقيف.','Collect a free exit card from Detention.','grant_exit_card',1,null,'🎫',13),
  ('sp-14','surprise','نداء الميناء','Harbor Call','تقدّم إلى أقرب محطة نقل فورًا.','Advance to the nearest transport hub.','move_to_nearest_hub',0,null,'⚓',14),
  ('sp-15','surprise','فرصة ذهبية','Golden Chance','انتقل إلى دبي — عاصمة الأعمال.','Advance to Dubai.','move_to',0,'dubai','🗺️',15),
  -- ============ صندوق المدينة ============
  ('cc-01','city_chest','خطأ بنكي','Bank Error','خطأ مصرفي لصالحك: استلم 100 درهم.','Bank error in your favor: collect 100 dirhams.','gain',100,null,'🏦',1),
  ('cc-02','city_chest','تبرع خيري','Charity Donation','تبرّع لمؤسسة المدينة: ادفع 50 درهمًا.','Donate to the city fund: pay 50 dirhams.','loss',50,null,'❤️',2),
  ('cc-03','city_chest','عوائد إقامة','Lodging Returns','أرباح تأجير شقتك: استلم 75 درهمًا.','Apartment rental income: collect 75 dirhams.','gain',75,null,'🏠',3),
  ('cc-04','city_chest','صيانة إجبارية','Forced Maintenance','ادفع 40 درهمًا عن كل مبنى و80 عن كل معلم مميز.','Pay 40 dirhams per building and 80 per landmark.','pay_per_building',40,null,'🏗️',4),
  ('cc-05','city_chest','رسوم استيراد','Import Fees','مواد بناء مستوردة: ادفع 150 درهمًا رسومًا.','Imported building materials: pay 150 dirhams in fees.','loss',150,null,'🚢',5),
  ('cc-06','city_chest','ميراث أرضي','Land Inheritance','ورثت قطعة أرض قيمة: استلم 200 درهم.','You inherited a valuable plot: collect 200 dirhams.','gain',200,null,'🌾',6),
  ('cc-07','city_chest','كفالة شراكة','Partnership Bond','كل لاعب يديك 25 درهمًا تسويةً للحسابات.','Each player pays you 25 dirhams.','collect_from_each',25,null,'🤲',7),
  ('cc-08','city_chest','حملة تجميل','Beautification Drive','ساهم في تجميل المدينة: ادفع 25 درهمًا لكل لاعب.','Contribute to the city: pay each player 25 dirhams.','pay_each',25,null,'🌸',8),
  ('cc-09','city_chest','عودة للوطن','Homeward','انتقل إلى نقطة البداية واحصل على المكافأة.','Advance to Start and collect the bonus.','move_to',0,'start','🧭',9),
  ('cc-10','city_chest','تصريح مرور','Transit Pass','استلم بطاقة خروج مجانية من التوقيف.','Collect a free exit card from Detention.','grant_exit_card',1,null,'🎫',10),
  ('cc-11','city_chest','مخالفة بناء','Building Violation','مخالفة بلدية عن توسعة غير مرخصة: ادفع 100 درهم.','Municipal fine for an unpermitted extension: pay 100 dirhams.','loss',100,null,'📋',11),
  ('cc-12','city_chest','سندات البلدية','Municipal Bonds','نضجت سنداتك: استلم 50 درهمًا.','Your bonds matured: collect 50 dirhams.','gain',50,null,'📜',12),
  ('cc-13','city_chest','موعد رسمي','Official Meeting','تقدّم إلى الرياض لحضور مؤتمر الاستثمار.','Advance to Riyadh for the investment conference.','move_to',0,'riyadh','🏛️',13),
  ('cc-14','city_chest','جولة تفقدية','Inspection Tour','انتقل إلى عمّان لافتتاح مشروع سكني.','Advance to Amman for a housing project opening.','move_to',0,'amman','🏘️',14),
  ('cc-15','city_chest','فوائد المدخرات','Savings Interest','فوائد حسابك: استلم 20 درهمًا.','Interest on your savings: collect 20 dirhams.','gain',20,null,'🪙',15)
on conflict (id) do update set
  deck = excluded.deck, title_ar = excluded.title_ar, title_en = excluded.title_en,
  description_ar = excluded.description_ar, description_en = excluded.description_en,
  effect_type = excluded.effect_type, effect_value = excluded.effect_value,
  target_tile = excluded.target_tile, icon = excluded.icon, sort_order = excluded.sort_order;
