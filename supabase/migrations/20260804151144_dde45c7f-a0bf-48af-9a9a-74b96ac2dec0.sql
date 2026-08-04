CREATE TABLE public.balance_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  ac_caixa_bancos numeric NOT NULL DEFAULT 0,
  ac_aplicacoes numeric NOT NULL DEFAULT 0,
  ac_contas_receber numeric NOT NULL DEFAULT 0,
  ac_estoques numeric NOT NULL DEFAULT 0,
  ac_adiantamentos numeric NOT NULL DEFAULT 0,
  ac_outros numeric NOT NULL DEFAULT 0,
  anc_imobilizado numeric NOT NULL DEFAULT 0,
  anc_intangivel numeric NOT NULL DEFAULT 0,
  anc_investimentos numeric NOT NULL DEFAULT 0,
  anc_outros numeric NOT NULL DEFAULT 0,
  pc_fornecedores numeric NOT NULL DEFAULT 0,
  pc_emprestimos_curto numeric NOT NULL DEFAULT 0,
  pc_obrigacoes_trabalhistas numeric NOT NULL DEFAULT 0,
  pc_obrigacoes_tributarias numeric NOT NULL DEFAULT 0,
  pc_outros numeric NOT NULL DEFAULT 0,
  pnc_emprestimos_longo numeric NOT NULL DEFAULT 0,
  pnc_parcelamentos_tributarios numeric NOT NULL DEFAULT 0,
  pnc_outros numeric NOT NULL DEFAULT 0,
  pl_capital_social numeric NOT NULL DEFAULT 0,
  pl_lucros_acumulados numeric NOT NULL DEFAULT 0,
  pl_resultado_periodo numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX balance_sheets_unique_period
  ON public.balance_sheets (owner_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), period_year, period_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_sheets TO authenticated;
GRANT ALL ON public.balance_sheets TO service_role;

ALTER TABLE public.balance_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own balance sheets" ON public.balance_sheets
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c WHERE c.id = balance_sheets.company_id AND c.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND (company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c WHERE c.id = balance_sheets.company_id AND c.owner_id = auth.uid()
    ))
  );

CREATE TRIGGER trg_balance_sheets_updated
  BEFORE UPDATE ON public.balance_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();