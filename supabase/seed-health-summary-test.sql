-- ============================================================
-- Test seed: 8 weeks of symptom_summaries + pre-built health_summaries
-- Usage: paste into Supabase Dashboard → SQL Editor → Run
-- Replace USER_ID with your actual user ID from the profile page
-- ============================================================

-- ❶ Set your user ID here
DO $$ 
DECLARE
  uid uuid := 'fbb0f3f7-95fe-4c69-9caa-f85597faa64b';  -- ← replace with your UID
  d date;
BEGIN

-- Temporarily disable RLS
ALTER TABLE public.symptom_summaries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_summaries DISABLE ROW LEVEL SECURITY;

-- Clean existing test data for this user
DELETE FROM public.health_summaries WHERE user_id = uid;
DELETE FROM public.symptom_summaries WHERE user_id = uid AND local_date < CURRENT_DATE - 13;

-- ❷ Insert 8 weeks of symptom data (week -2 to -9, Mon-Sun)
FOR i IN 2..9 LOOP
  d := date_trunc('week', CURRENT_DATE)::date - (i * 7);  -- Monday of that week

  INSERT INTO public.symptom_summaries (user_id, local_date, summary, tags, severity, meta) VALUES
    (uid, d,     'Morning headache, mild nausea',           ARRAY['headache','nausea'],     'medium', '{}'),
    (uid, d + 1, 'Fatigue throughout the day, low energy',  ARRAY['fatigue','low energy'],  'medium', '{}'),
    (uid, d + 2, 'Back pain from sitting, eye strain',      ARRAY['back pain','eye strain'],'low',    '{}'),
    (uid, d + 3, 'Anxiety before meeting, slight insomnia', ARRAY['anxiety','insomnia'],    'medium', '{}'),
    (uid, d + 4, 'Stomach discomfort after lunch',          ARRAY['stomach pain'],          'low',    '{}'),
    (uid, d + 5, 'Muscle soreness from exercise',           ARRAY['muscle pain'],           'low',    '{}'),
    (uid, d + 6, 'Generally okay, mild congestion',         ARRAY['congestion'],            'low',    '{}');
END LOOP;

-- ❸ Insert weekly_snapshot for each of those 8 weeks
FOR i IN 2..9 LOOP
  d := date_trunc('week', CURRENT_DATE)::date - (i * 7);

  INSERT INTO public.health_summaries (user_id, level, is_latest, window_start, window_end, summary, stats) VALUES
    (uid, 'weekly_snapshot', false, d, d + 6,
     'Week of ' || d || ': Recurring headaches and fatigue. Back pain from prolonged sitting. Occasional anxiety and stomach issues. Muscle soreness on weekends. Severity mostly low-medium. Congestion noted.',
     jsonb_build_object(
       'log_count', 7,
       'top_tags', jsonb_build_array('headache','fatigue','back pain','anxiety','stomach pain'),
       'tag_frequency', jsonb_build_object('headache',1,'nausea',1,'fatigue',1,'low energy',1,'back pain',1,'eye strain',1,'anxiety',1,'insomnia',1,'stomach pain',1,'muscle pain',1,'congestion',1),
       'avg_severity', 'low',
       'trend', CASE WHEN i > 5 THEN 'worsening' WHEN i > 3 THEN 'stable' ELSE 'improving' END
     )
    );
END LOOP;

-- ❹ Insert a monthly summary (covers weeks -5 to -9)
INSERT INTO public.health_summaries (user_id, level, is_latest, window_start, window_end, summary, stats) VALUES
  (uid, 'monthly', true,
   date_trunc('week', CURRENT_DATE)::date - 63,
   date_trunc('week', CURRENT_DATE)::date - 29,
   'Monthly report: Persistent headaches and fatigue pattern over past month. Stress-related anxiety noted mid-month with insomnia episodes. GI symptoms (nausea, stomach pain) intermittent. Back pain stable. Overall trajectory improving in second half as exercise-induced soreness replaced inactivity symptoms.',
   jsonb_build_object(
     'log_count', 35,
     'top_tags', jsonb_build_array('headache','fatigue','anxiety','back pain','stomach pain'),
     'tag_frequency', jsonb_build_object('headache',5,'fatigue',5,'back pain',5,'anxiety',5,'stomach pain',5,'nausea',5,'muscle pain',5),
     'avg_severity', 'medium',
     'trend', 'stable'
   )
  );

-- ❺ Insert rolling_weekly (covers weeks -2 to -4, since last monthly)
INSERT INTO public.health_summaries (user_id, level, is_latest, window_start, window_end, summary, stats) VALUES
  (uid, 'rolling_weekly', true,
   date_trunc('week', CURRENT_DATE)::date - 28,
   date_trunc('week', CURRENT_DATE)::date - 8,
   'Rolling weekly: Since last monthly report, symptoms have been mild. Headaches less frequent. Fatigue improved with better sleep hygiene. Back pain recurring but manageable. No significant GI episodes. Anxiety levels reduced.',
   jsonb_build_object(
     'log_count', 21,
     'top_tags', jsonb_build_array('headache','fatigue','back pain','congestion'),
     'tag_frequency', jsonb_build_object('headache',3,'fatigue',3,'back pain',3,'anxiety',3,'stomach pain',3,'congestion',3,'muscle pain',3),
     'avg_severity', 'low',
     'trend', 'improving'
   )
  );

-- ❻ Insert quarterly (from 3 months of monthly-level data)
INSERT INTO public.health_summaries (user_id, level, is_latest, window_start, window_end, summary, stats) VALUES
  (uid, 'quarterly', true,
   date_trunc('week', CURRENT_DATE)::date - 91,
   date_trunc('week', CURRENT_DATE)::date - 29,
   'Quarterly analysis (3 months): Initial period marked by frequent headaches, fatigue, and anxiety — likely stress-related. GI symptoms (stomach pain, nausea) appeared mid-quarter. Gradual improvement in second half: headache frequency decreased, sleep quality improved, anxiety episodes less frequent. Back pain remains a constant low-level issue, likely postural. Overall trend: stable with improving trajectory.',
   jsonb_build_object(
     'log_count', 84,
     'top_tags', jsonb_build_array('headache','fatigue','anxiety','back pain','stomach pain'),
     'tag_frequency', jsonb_build_object('headache',12,'fatigue',12,'back pain',10,'anxiety',8,'stomach pain',6,'nausea',4,'congestion',4),
     'avg_severity', 'medium',
     'trend', 'improving'
   )
  );

-- ❼ Insert biannual
INSERT INTO public.health_summaries (user_id, level, is_latest, window_start, window_end, summary, stats) VALUES
  (uid, 'biannual', true,
   date_trunc('week', CURRENT_DATE)::date - 182,
   date_trunc('week', CURRENT_DATE)::date - 29,
   'Six-month overview: Longitudinal pattern shows chronic low-grade headaches and fatigue as primary concerns. Anxiety peaks correlate with work stress periods. GI symptoms episodic, not worsening. Back pain has been persistent throughout — ergonomic adjustments recommended. Positive trend in latter 3 months: better sleep, reduced anxiety, headache frequency halved. Muscle soreness from increased physical activity is a welcome sign of lifestyle improvement.',
   jsonb_build_object(
     'log_count', 168,
     'top_tags', jsonb_build_array('headache','fatigue','anxiety','back pain','stomach pain'),
     'tag_frequency', jsonb_build_object('headache',24,'fatigue',22,'back pain',18,'anxiety',16,'stomach pain',12,'nausea',8,'congestion',6,'muscle pain',8),
     'avg_severity', 'medium',
     'trend', 'improving'
   )
  );

-- Re-enable RLS
ALTER TABLE public.symptom_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_summaries ENABLE ROW LEVEL SECURITY;

RAISE NOTICE 'Seeded 8 weeks of symptom data + all health summary levels for user %', uid;
END $$;
