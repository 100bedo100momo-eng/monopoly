-- ============================================================
-- 0009: الإجازات + كلمات محظورة أولية
-- ============================================================

insert into public.achievements (id, title_ar, title_en, description_ar, description_en, icon) values
  ('first_win','أول انتصار','First Victory','فز بأول مباراة لك في ملوك العقارات.','Win your first Property Kings match.','🥇'),
  ('champion','محترف السوق','Market Champion','حقق 5 انتصارات إجمالًا.','Reach 5 total wins.','👑'),
  ('veteran','تاجر مخضرم','Veteran Trader','خضت 10 مباريات كاملة.','Play 10 full matches.','🎖️'),
  ('tycoon','قطب العقارات','Real-Estate Tycoon','وصلت صافي ثروتك إلى 5000 درهم في مباراة واحدة.','Reach a net worth of 5,000 dirhams in one match.','💎'),
  ('full_set','مجموعة كاملة','Full Collection','امتلكت مجموعة لونية كاملة حتى نهاية المباراة.','Own a complete color group at the end of a match.','🎨')
on conflict (id) do update set
  title_ar = excluded.title_ar, title_en = excluded.title_en,
  description_ar = excluded.description_ar, description_en = excluded.description_en,
  icon = excluded.icon;

insert into public.banned_words (word) values
  ('stupid'), ('idiot'), ('غبي'), ('حقير'), ('كلب'), ('t7a'), ('dontia')
on conflict (word) do nothing;
