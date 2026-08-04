ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS cost_type text,
  ADD COLUMN IF NOT EXISTS dre_group text;

CREATE TABLE public.dre_category_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  dre_group text NOT NULL,
  cost_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_category_map TO authenticated;
GRANT ALL ON public.dre_category_map TO service_role;

ALTER TABLE public.dre_category_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own dre map" ON public.dre_category_map
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_dre_map_updated
  BEFORE UPDATE ON public.dre_category_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();