-- ============================================================
-- Self-evolving symptom taxonomy tables
-- Standards + variants in DB, AI can expand, full audit trail
-- ============================================================

-- 1) Standard keys (e.g. "疲劳", "headache", "dolor_de_cabeza")
CREATE TABLE IF NOT EXISTS public.taxonomy_standards (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lang       text        NOT NULL CHECK (lang IN ('zh', 'en', 'es')),
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lang, key)
);

-- 2) Variant → standard mapping (each variant maps to exactly one standard)
CREATE TABLE IF NOT EXISTS public.taxonomy_variants (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   uuid        NOT NULL REFERENCES public.taxonomy_standards(id) ON DELETE CASCADE,
  variant       text        NOT NULL,
  lang          text        NOT NULL CHECK (lang IN ('zh', 'en', 'es')),
  source        text        NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'ai', 'manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  UNIQUE(lang, variant)
);

-- 3) AI decision audit log
CREATE TABLE IF NOT EXISTS public.taxonomy_ai_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  lang            text        NOT NULL,
  input_keywords  text[]      NOT NULL,
  ai_response     jsonb       NOT NULL,
  applied         jsonb,
  skipped         jsonb,
  request_id      text
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_taxonomy_variants_lang_variant
  ON public.taxonomy_variants(lang, variant);

CREATE INDEX IF NOT EXISTS idx_taxonomy_standards_lang
  ON public.taxonomy_standards(lang);

-- RLS: service-role only (no user-facing access)
ALTER TABLE public.taxonomy_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_ai_logs ENABLE ROW LEVEL SECURITY;
