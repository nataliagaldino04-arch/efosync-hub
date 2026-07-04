-- 1) dedupe_key column for reliable upsert semantics
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS installment_group_id uuid;

-- Backfill existing rows that have external_id
UPDATE public.financial_transactions
SET dedupe_key = owner_id::text || '|' || COALESCE(source_system,'') || '|' || external_id
WHERE external_id IS NOT NULL AND dedupe_key IS NULL;

-- Trigger to keep dedupe_key in sync automatically
CREATE OR REPLACE FUNCTION public.compute_dedupe_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.external_id IS NOT NULL AND NEW.external_id <> '' THEN
    NEW.dedupe_key := NEW.owner_id::text || '|' || COALESCE(NEW.source_system,'') || '|' || NEW.external_id;
  ELSE
    NEW.dedupe_key := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_compute_dedupe_key ON public.financial_transactions;
CREATE TRIGGER trg_compute_dedupe_key
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.compute_dedupe_key();

-- Ensure compute_tx_status trigger is actually attached (was missing from db-triggers list)
DROP TRIGGER IF EXISTS trg_compute_tx_status ON public.financial_transactions;
CREATE TRIGGER trg_compute_tx_status
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.compute_tx_status();

-- Ensure action plans computed trigger is attached
DROP TRIGGER IF EXISTS trg_update_action_plan_computed ON public.action_plans_5w2h;
CREATE TRIGGER trg_update_action_plan_computed
  BEFORE INSERT OR UPDATE ON public.action_plans_5w2h
  FOR EACH ROW EXECUTE FUNCTION public.update_action_plan_computed();

-- Unique index for upsert on dedupe_key
DROP INDEX IF EXISTS public.financial_transactions_owner_source_extid_key;
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_dedupe_key_unique
  ON public.financial_transactions (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Index to speed up installment group lookups
CREATE INDEX IF NOT EXISTS financial_transactions_installment_group_idx
  ON public.financial_transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;
