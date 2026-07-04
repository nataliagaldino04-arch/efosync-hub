# EFO — Análise Econômica, Financeira e Operacional

Sistema web completo para substituir planilhas financeiras manuais, com autenticação, banco de dados, dashboard, importação/exportação, cálculos automáticos de juros e relatórios.

## Escopo e abordagem

O pedido é grande. Proponho entregar em **3 fases** para garantir qualidade em cada etapa. Cada fase é utilizável de forma independente.

---

## Fase 1 — Fundação (essencial para funcionar)

**Backend (Lovable Cloud + Supabase):**
- Habilitar Lovable Cloud
- Autenticação email/senha (login obrigatório, RLS em todas as tabelas, cada usuário só vê seus dados via `owner_id = auth.uid()`)
- Migrations criando todas as tabelas do briefing: `companies`, `financial_transactions`, `import_batches`, `import_errors`, `categories`, `efo_monthly_analysis`, `action_plans_5w2h` (com coluna `owner_id` adicionada para RLS)
- Seed de categorias padrão (receitas, despesas fixas, variáveis)
- Trigger para `updated_at` e para calcular `status` automaticamente

**Design system:**
- Paleta clara e profissional (fundo claro, verde=pago, vermelho=vencido, amarelo=atenção, azul=info) via tokens `oklch` em `src/styles.css`
- Layout com **sidebar** colapsável (shadcn sidebar) contendo os 13 itens do menu
- Componentes reutilizáveis: DataTable com busca/filtro/ordenação, StatCard, FilterBar, ExportButton

**Módulos funcionais nesta fase:**
1. **Auth** (`/auth`) — login/cadastro
2. **Dashboard** (`/`) — cards principais + gráficos (Recharts): Receitas x Despesas, Fluxo de caixa, Juros acumulados, Categorias. Filtros por cliente, período, status, categoria.
3. **Clientes/Empresas** (`/clientes`) — CRUD completo
4. **Lançamentos Financeiros** (`/lancamentos`) — CRUD com todos os campos, status automático, edição rápida, duplicar, excluir, marcar como pago, filtros
5. **Simulador de Juros** (`/simulador`) — juros simples e composto, gráfico de evolução mensal

## Fase 2 — Parcelamentos, Importação/Exportação, Relatórios

6. **Parcelamentos / PMT** (`/parcelamentos`) — gerar parcelas automaticamente, marcar pagas, pagamento parcial, recalcular juros
7. **Contas a Receber** e **Contas a Pagar** — views filtradas de lançamentos
8. **Importação de Planilhas** (`/importacao`) — upload XLSX/CSV via SheetJS, mapeamento de colunas, prévia, validações (moeda BR, datas BR incluindo `12/jun`, status "pago/sim/não"), histórico em `import_batches`, download de erros
9. **Exportação** (`/exportacao`) — modelo de importação, dados no padrão EFO, XLSX/CSV
10. **Relatórios** (`/relatorios`) — financeiro mensal, contas a receber, juros, EFO (econômico/financeiro/operacional), inadimplência por faixa

## Fase 3 — Análise EFO, Plano de Ação, API

11. **Análise EFO** (`/analise-efo`) — cards, gráficos e tabela detalhada das 3 dimensões
12. **Plano de Ação 5W2H** (`/plano-acao`) — CRUD, cálculo de dias restantes, criação a partir de relatórios
13. **Configurações** (`/configuracoes`) — categorias, centros de custo, preferências
14. **API pública** — server routes em `/api/public/import/financial-transactions` (POST com HMAC), `/api/public/export/template`, `/api/public/reports/*`

## Detalhes técnicos

- **Stack:** TanStack Start + React 19 + Tailwind v4 + shadcn + Lovable Cloud (Supabase)
- **Rotas protegidas:** `src/routes/_authenticated/*`; `/auth` é público
- **Server functions:** `createServerFn` + `requireSupabaseAuth` para leituras/escritas do usuário
- **Cálculos:** helpers puros em `src/lib/finance.ts` (juros simples/composto, dias de atraso, status, inadimplência)
- **Parsing BR:** helpers em `src/lib/br-format.ts` (moeda `R$ 1.234,56`, datas `12/06/2026` e `12/jun`, booleans "sim/não/pago")
- **Gráficos:** Recharts
- **Planilhas:** biblioteca `xlsx` (SheetJS)

## O que quero confirmar antes de começar

**Sugiro começar pela Fase 1 agora** (fundação + 5 módulos principais já dão um sistema utilizável de ponta a ponta: cadastrar cliente → lançar movimento → ver dashboard → simular juros). Fases 2 e 3 seguem em turnos seguintes.

Se preferir, posso tentar tudo em um único passo — porém o risco de bugs, telas incompletas e problemas de build aumenta bastante dado o volume.

**Confirma que sigo com a Fase 1?** (ou me diga se prefere reordenar prioridades — por exemplo, importação antes do simulador).
