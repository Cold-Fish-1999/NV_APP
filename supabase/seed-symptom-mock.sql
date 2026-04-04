-- Mock 数据：最近 14 天，user_id = fbb0f3f7-95fe-4c69-9caa-f85597faa64b
-- 在 Supabase Dashboard -> SQL Editor 中执行（需用 service role 或关闭 RLS 后执行）
-- 若通过 RLS 执行，需先以该用户登录

-- 临时禁用 RLS 以便插入（执行完后可重新启用）
ALTER TABLE public.symptom_summaries DISABLE ROW LEVEL SECURITY;

INSERT INTO public.symptom_summaries (user_id, local_date, created_at, summary, tags, meta)
VALUES
-- 第 1 天（今天）
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE, (CURRENT_DATE + TIME '07:15')::timestamptz, '早上起来有点头痛，可能是没睡好', ARRAY['头痛'], '{"symptom_keywords": ["头痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE, (CURRENT_DATE + TIME '10:30')::timestamptz, '感觉比较累，下午想休息', ARRAY['乏力', '疲劳'], '{"symptom_keywords": ["乏力", "疲劳"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE, (CURRENT_DATE + TIME '14:45')::timestamptz, '肚子不太舒服，有点腹泻', ARRAY['腹泻'], '{"symptom_keywords": ["腹泻"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE, (CURRENT_DATE + TIME '19:20')::timestamptz, '喉咙有点痒，偶尔咳嗽', ARRAY['咳嗽', '喉咙痛'], '{"symptom_keywords": ["咳嗽", "喉咙痛"]}'::jsonb),
-- 第 2 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 1, (CURRENT_DATE - 1 + TIME '06:30')::timestamptz, '昨晚睡得不太好，有点失眠', ARRAY['失眠'], '{"symptom_keywords": ["失眠"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 1, (CURRENT_DATE - 1 + TIME '11:00')::timestamptz, '可能着凉了，有点感冒症状', ARRAY['感冒', '鼻塞'], '{"symptom_keywords": ["感冒", "鼻塞"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 1, (CURRENT_DATE - 1 + TIME '16:20')::timestamptz, '体温略高，有点发热', ARRAY['发热'], '{"symptom_keywords": ["发热"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 1, (CURRENT_DATE - 1 + TIME '22:10')::timestamptz, '胃部隐隐作痛', ARRAY['胃痛'], '{"symptom_keywords": ["胃痛"]}'::jsonb),
-- 第 3 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 2, (CURRENT_DATE - 2 + TIME '07:45')::timestamptz, '站起来有点头晕', ARRAY['头晕'], '{"symptom_keywords": ["头晕"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 2, (CURRENT_DATE - 2 + TIME '13:15')::timestamptz, '有点恶心，不想吃东西', ARRAY['恶心', '食欲不振'], '{"symptom_keywords": ["恶心", "食欲不振"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 2, (CURRENT_DATE - 2 + TIME '20:00')::timestamptz, '整体比较疲劳', ARRAY['疲劳'], '{"symptom_keywords": ["疲劳"]}'::jsonb),
-- 第 4 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 3, (CURRENT_DATE - 3 + TIME '08:00')::timestamptz, '心情有点焦虑', ARRAY['焦虑'], '{"symptom_keywords": ["焦虑"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 3, (CURRENT_DATE - 3 + TIME '15:30')::timestamptz, '后背酸痛，可能是坐久了', ARRAY['背痛'], '{"symptom_keywords": ["背痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 3, (CURRENT_DATE - 3 + TIME '23:30')::timestamptz, '眼睛干涩，盯屏幕太久', ARRAY['眼睛干涩'], '{"symptom_keywords": ["眼睛干涩"]}'::jsonb),
-- 第 5 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 4, (CURRENT_DATE - 4 + TIME '06:50')::timestamptz, '口干舌燥，多喝点水', ARRAY['口干'], '{"symptom_keywords": ["口干"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 4, (CURRENT_DATE - 4 + TIME '12:00')::timestamptz, '鼻子有点堵', ARRAY['鼻塞'], '{"symptom_keywords": ["鼻塞"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 4, (CURRENT_DATE - 4 + TIME '18:45')::timestamptz, '没什么胃口', ARRAY['食欲不振'], '{"symptom_keywords": ["食欲不振"]}'::jsonb),
-- 第 6 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 5, (CURRENT_DATE - 5 + TIME '09:20')::timestamptz, '心跳有点快', ARRAY['心悸'], '{"symptom_keywords": ["心悸"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 5, (CURRENT_DATE - 5 + TIME '14:00')::timestamptz, '全身肌肉酸痛', ARRAY['肌肉酸痛'], '{"symptom_keywords": ["肌肉酸痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 5, (CURRENT_DATE - 5 + TIME '21:15')::timestamptz, '喉咙痛，吞咽不舒服', ARRAY['喉咙痛'], '{"symptom_keywords": ["喉咙痛"]}'::jsonb),
-- 第 7 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 6, (CURRENT_DATE - 6 + TIME '07:00')::timestamptz, '早上头痛加重', ARRAY['头痛'], '{"symptom_keywords": ["头痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 6, (CURRENT_DATE - 6 + TIME '10:45')::timestamptz, '有点乏力', ARRAY['乏力'], '{"symptom_keywords": ["乏力"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 6, (CURRENT_DATE - 6 + TIME '17:30')::timestamptz, '腹泻好转', ARRAY['腹泻'], '{"symptom_keywords": ["腹泻"]}'::jsonb),
-- 第 8 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 7, (CURRENT_DATE - 7 + TIME '08:30')::timestamptz, '咳嗽减轻', ARRAY['咳嗽'], '{"symptom_keywords": ["咳嗽"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 7, (CURRENT_DATE - 7 + TIME '13:00')::timestamptz, '感冒症状缓解', ARRAY['感冒'], '{"symptom_keywords": ["感冒"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 7, (CURRENT_DATE - 7 + TIME '19:50')::timestamptz, '失眠改善', ARRAY['失眠'], '{"symptom_keywords": ["失眠"]}'::jsonb),
-- 第 9 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 8, (CURRENT_DATE - 8 + TIME '06:15')::timestamptz, '发热已退', ARRAY['发热'], '{"symptom_keywords": ["发热"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 8, (CURRENT_DATE - 8 + TIME '11:30')::timestamptz, '胃痛好转', ARRAY['胃痛'], '{"symptom_keywords": ["胃痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 8, (CURRENT_DATE - 8 + TIME '16:45')::timestamptz, '头晕消失', ARRAY['头晕'], '{"symptom_keywords": ["头晕"]}'::jsonb),
-- 第 10 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 9, (CURRENT_DATE - 9 + TIME '07:30')::timestamptz, '恶心感减轻', ARRAY['恶心'], '{"symptom_keywords": ["恶心"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 9, (CURRENT_DATE - 9 + TIME '15:00')::timestamptz, '疲劳感明显', ARRAY['疲劳'], '{"symptom_keywords": ["疲劳"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 9, (CURRENT_DATE - 9 + TIME '22:00')::timestamptz, '焦虑有所缓解', ARRAY['焦虑'], '{"symptom_keywords": ["焦虑"]}'::jsonb),
-- 第 11 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 10, (CURRENT_DATE - 10 + TIME '09:00')::timestamptz, '背痛持续', ARRAY['背痛'], '{"symptom_keywords": ["背痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 10, (CURRENT_DATE - 10 + TIME '14:20')::timestamptz, '眼睛干涩', ARRAY['眼睛干涩'], '{"symptom_keywords": ["眼睛干涩"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 10, (CURRENT_DATE - 10 + TIME '20:30')::timestamptz, '口干改善', ARRAY['口干'], '{"symptom_keywords": ["口干"]}'::jsonb),
-- 第 12 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 11, (CURRENT_DATE - 11 + TIME '08:00')::timestamptz, '鼻塞好转', ARRAY['鼻塞'], '{"symptom_keywords": ["鼻塞"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 11, (CURRENT_DATE - 11 + TIME '12:30')::timestamptz, '食欲恢复', ARRAY['食欲不振'], '{"symptom_keywords": ["食欲不振"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 11, (CURRENT_DATE - 11 + TIME '18:00')::timestamptz, '心悸减轻', ARRAY['心悸'], '{"symptom_keywords": ["心悸"]}'::jsonb),
-- 第 13 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 12, (CURRENT_DATE - 12 + TIME '07:20')::timestamptz, '肌肉酸痛缓解', ARRAY['肌肉酸痛'], '{"symptom_keywords": ["肌肉酸痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 12, (CURRENT_DATE - 12 + TIME '10:00')::timestamptz, '喉咙痛好转', ARRAY['喉咙痛'], '{"symptom_keywords": ["喉咙痛"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 12, (CURRENT_DATE - 12 + TIME '21:00')::timestamptz, '整体状态良好', ARRAY['头痛'], '{"symptom_keywords": ["头痛"]}'::jsonb),
-- 第 14 天
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 13, (CURRENT_DATE - 13 + TIME '06:45')::timestamptz, '早起头痛', ARRAY['头痛', '乏力'], '{"symptom_keywords": ["头痛", "乏力"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 13, (CURRENT_DATE - 13 + TIME '11:15')::timestamptz, '轻微腹泻', ARRAY['腹泻'], '{"symptom_keywords": ["腹泻"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 13, (CURRENT_DATE - 13 + TIME '17:00')::timestamptz, '咳嗽偶发', ARRAY['咳嗽'], '{"symptom_keywords": ["咳嗽"]}'::jsonb),
('fbb0f3f7-95fe-4c69-9caa-f85597faa64b', CURRENT_DATE - 13, (CURRENT_DATE - 13 + TIME '23:45')::timestamptz, '睡前有点失眠', ARRAY['失眠'], '{"symptom_keywords": ["失眠"]}'::jsonb);

-- 重新启用 RLS
ALTER TABLE public.symptom_summaries ENABLE ROW LEVEL SECURITY;
