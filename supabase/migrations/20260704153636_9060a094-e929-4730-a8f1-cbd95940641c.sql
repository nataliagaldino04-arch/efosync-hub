
-- Trigger helper for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- ============ companies ============
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text,
  phone text,
  email text,
  responsible text,
  city text,
  state text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own companies" ON public.companies FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_companies_owner ON public.companies(owner_id);

-- ============ categories ============
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'revenue' | 'fixed_expense' | 'variable_expense'
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_categories_owner ON public.categories(owner_id);

-- ============ financial_transactions ============
CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  external_id text,
  movement_type text NOT NULL, -- Receita | Despesa | Conta a Receber | Conta a Pagar | Parcelamento | Juros | Ajuste
  category text,
  cost_center text,
  description text,
  original_value numeric(14,2) NOT NULL DEFAULT 0,
  installment_value numeric(14,2) NOT NULL DEFAULT 0,
  paid_value numeric(14,2) NOT NULL DEFAULT 0,
  interest_rate_month numeric(8,4) NOT NULL DEFAULT 0,
  interest_type text NOT NULL DEFAULT 'simple', -- simple | compound
  competence_date date,
  due_date date,
  payment_date date,
  installment_number int,
  installment_total int,
  payment_method text,
  status text NOT NULL DEFAULT 'Em aberto',
  source_system text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.financial_transactions FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_tx_owner ON public.financial_transactions(owner_id);
CREATE INDEX idx_tx_company ON public.financial_transactions(company_id);
CREATE INDEX idx_tx_due ON public.financial_transactions(due_date);
CREATE INDEX idx_tx_status ON public.financial_transactions(status);

-- ============ import_batches ============
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text,
  source_system text,
  total_rows int NOT NULL DEFAULT 0,
  imported_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own batches" ON public.import_batches FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============ import_errors ============
CREATE TABLE public.import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number int,
  field_name text,
  error_message text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_errors TO authenticated;
GRANT ALL ON public.import_errors TO service_role;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own import errors" ON public.import_errors FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============ efo_monthly_analysis ============
CREATE TABLE public.efo_monthly_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month int NOT NULL,
  period_year int NOT NULL,
  total_revenue numeric(14,2) NOT NULL DEFAULT 0,
  service_revenue numeric(14,2) NOT NULL DEFAULT 0,
  product_revenue numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses numeric(14,2) NOT NULL DEFAULT 0,
  fixed_expenses numeric(14,2) NOT NULL DEFAULT 0,
  variable_expenses numeric(14,2) NOT NULL DEFAULT 0,
  operational_result numeric(14,2) NOT NULL DEFAULT 0,
  cash_balance numeric(14,2) NOT NULL DEFAULT 0,
  interest_total numeric(14,2) NOT NULL DEFAULT 0,
  overdue_total numeric(14,2) NOT NULL DEFAULT 0,
  paid_total numeric(14,2) NOT NULL DEFAULT 0,
  open_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.efo_monthly_analysis TO authenticated;
GRANT ALL ON public.efo_monthly_analysis TO service_role;
ALTER TABLE public.efo_monthly_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own efo" ON public.efo_monthly_analysis FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============ action_plans_5w2h ============
CREATE TABLE public.action_plans_5w2h (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  what text,
  why text,
  who text,
  where_field text,
  how text,
  how_much numeric(14,2),
  when_date date,
  status text NOT NULL DEFAULT 'Pendente',
  priority text NOT NULL DEFAULT 'Normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_plans_5w2h TO authenticated;
GRANT ALL ON public.action_plans_5w2h TO service_role;
ALTER TABLE public.action_plans_5w2h ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own action plans" ON public.action_plans_5w2h FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.action_plans_5w2h
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Seed default categories per new user ============
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (owner_id, type, name) VALUES
    (NEW.id, 'revenue', 'Serviços'),
    (NEW.id, 'revenue', 'Vendas'),
    (NEW.id, 'revenue', 'Juros recebidos'),
    (NEW.id, 'revenue', 'Outros recebimentos'),
    (NEW.id, 'fixed_expense', 'Aluguel'),
    (NEW.id, 'fixed_expense', 'Energia/Água'),
    (NEW.id, 'fixed_expense', 'Internet'),
    (NEW.id, 'fixed_expense', 'Salários'),
    (NEW.id, 'fixed_expense', 'Sistemas'),
    (NEW.id, 'fixed_expense', 'Contabilidade'),
    (NEW.id, 'variable_expense', 'Produtos'),
    (NEW.id, 'variable_expense', 'Comissões'),
    (NEW.id, 'variable_expense', 'Manutenção'),
    (NEW.id, 'variable_expense', 'Taxas'),
    (NEW.id, 'variable_expense', 'Impostos'),
    (NEW.id, 'variable_expense', 'Outros');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_seed_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();
