DROP INDEX IF EXISTS public.financial_transactions_dedupe_key_unique;
CREATE UNIQUE INDEX financial_transactions_dedupe_key_unique
  ON public.financial_transactions (dedupe_key);
