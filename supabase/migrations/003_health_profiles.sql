-- ============================================================
-- NVAPP：用户健康档案 health_profiles
-- 性别、年龄、职业、不良嗜好、过往病史、家族遗传等
-- ============================================================

CREATE TABLE IF NOT EXISTS public.health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gender text,
  age integer CHECK (age IS NULL OR (age >= 0 AND age <= 150)),
  occupation text,
  bad_habits text,
  medical_history text,
  family_history text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS health_profiles_user_id_idx ON public.health_profiles (user_id);

ALTER TABLE public.health_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_profiles_select_own"
  ON public.health_profiles FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "health_profiles_insert_own"
  ON public.health_profiles FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "health_profiles_update_own"
  ON public.health_profiles FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "health_profiles_delete_own"
  ON public.health_profiles FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER health_profiles_updated_at
  BEFORE UPDATE ON public.health_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
