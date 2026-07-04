
-- ============ action_plans_5w2h: days_remaining + status Atrasado ============
ALTER TABLE public.action_plans_5w2h ADD COLUMN IF NOT EXISTS days_remaining int;

CREATE OR REPLACE FUNCTION public.update_action_plan_computed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.when_date IS NOT NULL THEN
    NEW.days_remaining := (NEW.when_date - CURRENT_DATE);
    IF NEW.status NOT IN ('Concluído','Cancelado') AND NEW.when_date < CURRENT_DATE THEN
      NEW.status := 'Atrasado';
    END IF;
  ELSE
    NEW.days_remaining := NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_action_plan_computed ON public.action_plans_5w2h;
CREATE TRIGGER trg_action_plan_computed
  BEFORE INSERT OR UPDATE ON public.action_plans_5w2h
  FOR EACH ROW EXECUTE FUNCTION public.update_action_plan_computed();

UPDATE public.action_plans_5w2h SET when_date = when_date;

-- ============ financial_transactions: dedupe + status trigger ============
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_external
  ON public.financial_transactions (owner_id, source_system, external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_tx_status()
RETURNS TRIGGER AS $$
DECLARE
  rate numeric := COALESCE(NEW.interest_rate_month, 0) / 100.0;
  months numeric := 0;
  interest numeric := 0;
  updated_val numeric;
  end_date date := COALESCE(NEW.payment_date, CURRENT_DATE);
BEGIN
  IF NEW.status = 'Cancelado' THEN
    RETURN NEW;
  END IF;

  IF NEW.due_date IS NOT NULL AND end_date > NEW.due_date THEN
    months := GREATEST(0, (end_date - NEW.due_date))::numeric / 30.0;
  END IF;

  IF rate > 0 AND months > 0 AND NEW.original_value > 0 THEN
    IF NEW.interest_type = 'compound' THEN
      interest := NEW.original_value * (power(1 + rate, months) - 1);
    ELSE
      interest := NEW.original_value * rate * months;
    END IF;
  END IF;

  updated_val := COALESCE(NEW.original_value,0) + interest;

  IF COALESCE(NEW.paid_value,0) >= updated_val AND updated_val > 0 THEN
    NEW.status := 'Pago';
  ELSIF COALESCE(NEW.paid_value,0) > 0 AND NEW.paid_value < updated_val THEN
    NEW.status := 'Parcial';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'Vencido';
  ELSIF NEW.due_date IS NOT NULL AND NEW.due_date >= CURRENT_DATE THEN
    NEW.status := 'A vencer';
  ELSE
    NEW.status := 'Em aberto';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_tx_status ON public.financial_transactions;
CREATE TRIGGER trg_tx_status
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.compute_tx_status();

-- ============ RLS reforçada: company_id precisa pertencer ao owner ============
DROP POLICY IF EXISTS "own transactions" ON public.financial_transactions;
CREATE POLICY "own transactions" ON public.financial_transactions FOR ALL
  USING (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = financial_transactions.company_id AND c.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = financial_transactions.company_id AND c.owner_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "own action plans" ON public.action_plans_5w2h;
CREATE POLICY "own action plans" ON public.action_plans_5w2h FOR ALL
  USING (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = action_plans_5w2h.company_id AND c.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = action_plans_5w2h.company_id AND c.owner_id = auth.uid()
    ))
  );

REVOKE EXECUTE ON FUNCTION public.compute_tx_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_action_plan_computed() FROM PUBLIC, anon, authenticated;
