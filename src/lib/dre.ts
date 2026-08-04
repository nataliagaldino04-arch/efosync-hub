// DRE Gerencial (modelo EFO) e índices econômico-financeiros.
import { computeUpdated } from "./finance";
import { RECEIVABLE_TYPES, PAYABLE_TYPES } from "./efo-schema";
import { suggestDreGroup, type DreGroup } from "./import-profiles";

/** Ordem canônica dos grupos de despesa no DRE. */
export const DRE_EXPENSE_ORDER: DreGroup[] = [
  "Impostos sobre vendas e receitas",
  "Custo da Venda",
  "Despesas Comerciais",
  "Despesas Administrativas",
  "Despesas com Pessoal",
  "Despesas Tributárias",
  "Dívidas e Investimentos",
  "Não classificado",
];

export interface DreMonth {
  /** 1..12 */
  month: number;
  label: string;
  receitaBruta: number;
  impostos: number;
  receitaLiquida: number;
  custoVenda: number;
  lucroBruto: number;
  comerciais: number;
  administrativas: number;
  pessoal: number;
  tributarias: number;
  resultadoOperacional: number;
  dividasInvestimentos: number;
  naoClassificado: number;
  resultadoLiquido: number;
  despesasFixas: number;
  despesasVariaveis: number;
  juros: number;
  groups: Record<string, number>;
}

export type TxLike = Record<string, unknown>;

function emptyMonth(year: number, i: number): DreMonth {
  return {
    month: i + 1,
    label: new Date(year, i, 1).toLocaleDateString("pt-BR", { month: "short" }),
    receitaBruta: 0,
    impostos: 0,
    receitaLiquida: 0,
    custoVenda: 0,
    lucroBruto: 0,
    comerciais: 0,
    administrativas: 0,
    pessoal: 0,
    tributarias: 0,
    resultadoOperacional: 0,
    dividasInvestimentos: 0,
    naoClassificado: 0,
    resultadoLiquido: 0,
    despesasFixas: 0,
    despesasVariaveis: 0,
    juros: 0,
    groups: {},
  };
}

const GROUP_TO_FIELD: Record<string, keyof DreMonth> = {
  "Impostos sobre vendas e receitas": "impostos",
  "Custo da Venda": "custoVenda",
  "Despesas Comerciais": "comerciais",
  "Despesas Administrativas": "administrativas",
  "Despesas com Pessoal": "pessoal",
  "Despesas Tributárias": "tributarias",
  "Dívidas e Investimentos": "dividasInvestimentos",
  "Não classificado": "naoClassificado",
};

/** Monta o DRE gerencial de 12 meses a partir dos lançamentos. */
export function buildDre(txs: TxLike[], year: number): DreMonth[] {
  const rows = Array.from({ length: 12 }, (_, i) => emptyMonth(year, i));
  for (const t of txs) {
    const due = String(t.due_date ?? "");
    const d = new Date(due + "T00:00:00");
    if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    const row = rows[d.getMonth()];
    const info = computeUpdated({
      principal: Number(t.original_value ?? 0),
      monthlyRatePct: Number(t.interest_rate_month ?? 0),
      type: (t.interest_type as "simple" | "compound") || "simple",
      dueDate: (t.due_date as string) ?? null,
      paymentDate: (t.payment_date as string) ?? null,
      paid: Number(t.paid_value ?? 0),
    });
    row.juros += info.interest;
    const type = String(t.movement_type ?? "");
    if ((RECEIVABLE_TYPES as unknown as string[]).includes(type)) {
      row.receitaBruta += info.updated;
      continue;
    }
    if (!(PAYABLE_TYPES as unknown as string[]).includes(type)) continue;

    const group = (String(t.dre_group ?? "") ||
      suggestDreGroup(t.category as string | null)) as DreGroup;
    const field = GROUP_TO_FIELD[group] ?? "naoClassificado";
    (row[field] as number) += info.updated;
    row.groups[group] = (row.groups[group] ?? 0) + info.updated;

    const costType = String(t.cost_type ?? "").toLowerCase();
    if (costType.startsWith("fix")) row.despesasFixas += info.updated;
    else row.despesasVariaveis += info.updated;
  }
  for (const r of rows) {
    r.receitaLiquida = r.receitaBruta - r.impostos;
    r.lucroBruto = r.receitaLiquida - r.custoVenda;
    r.resultadoOperacional =
      r.lucroBruto - r.comerciais - r.administrativas - r.pessoal - r.tributarias;
    r.resultadoLiquido = r.resultadoOperacional - r.dividasInvestimentos - r.naoClassificado;
  }
  return rows;
}

const NUMERIC_KEYS = [
  "receitaBruta",
  "impostos",
  "receitaLiquida",
  "custoVenda",
  "lucroBruto",
  "comerciais",
  "administrativas",
  "pessoal",
  "tributarias",
  "resultadoOperacional",
  "dividasInvestimentos",
  "naoClassificado",
  "resultadoLiquido",
  "despesasFixas",
  "despesasVariaveis",
  "juros",
] as const;

export function sumDre(months: DreMonth[]): DreMonth {
  const out = emptyMonth(new Date().getFullYear(), 0);
  out.label = "Total";
  out.month = 0;
  for (const m of months) {
    for (const k of NUMERIC_KEYS) out[k] += m[k];
    for (const [g, v] of Object.entries(m.groups)) out.groups[g] = (out.groups[g] ?? 0) + v;
  }
  return out;
}

/** Linhas exibíveis do DRE, na ordem do modelo EFO. */
export interface DreLine {
  label: string;
  key: (typeof NUMERIC_KEYS)[number];
  kind: "revenue" | "deduction" | "subtotal" | "result";
}

export const DRE_LINES: DreLine[] = [
  { label: "Receita Bruta", key: "receitaBruta", kind: "revenue" },
  { label: "(-) Impostos sobre vendas e receitas", key: "impostos", kind: "deduction" },
  { label: "= Receita Líquida", key: "receitaLiquida", kind: "subtotal" },
  { label: "(-) Custo da Venda", key: "custoVenda", kind: "deduction" },
  { label: "= Lucro Bruto", key: "lucroBruto", kind: "subtotal" },
  { label: "(-) Despesas Comerciais", key: "comerciais", kind: "deduction" },
  { label: "(-) Despesas Administrativas", key: "administrativas", kind: "deduction" },
  { label: "(-) Despesas com Pessoal", key: "pessoal", kind: "deduction" },
  { label: "(-) Despesas Tributárias", key: "tributarias", kind: "deduction" },
  { label: "= Resultado Operacional", key: "resultadoOperacional", kind: "subtotal" },
  { label: "(-) Dívidas e Investimentos", key: "dividasInvestimentos", kind: "deduction" },
  { label: "(-) Não classificado", key: "naoClassificado", kind: "deduction" },
  { label: "= Resultado Líquido", key: "resultadoLiquido", kind: "result" },
];

// ---------------------------------------------------------------------------
// Balanço Gerencial
// ---------------------------------------------------------------------------

export interface BalanceField {
  key: string;
  label: string;
}
export interface BalanceSection {
  id: "ac" | "anc" | "pc" | "pnc" | "pl";
  title: string;
  side: "ativo" | "passivo";
  fields: BalanceField[];
}

export const BALANCE_SECTIONS: BalanceSection[] = [
  {
    id: "ac",
    title: "Ativo Circulante",
    side: "ativo",
    fields: [
      { key: "ac_caixa_bancos", label: "Caixa e bancos" },
      { key: "ac_aplicacoes", label: "Aplicações financeiras" },
      { key: "ac_contas_receber", label: "Contas a receber" },
      { key: "ac_estoques", label: "Estoques" },
      { key: "ac_adiantamentos", label: "Adiantamentos" },
      { key: "ac_outros", label: "Outros ativos circulantes" },
    ],
  },
  {
    id: "anc",
    title: "Ativo Não Circulante",
    side: "ativo",
    fields: [
      { key: "anc_imobilizado", label: "Imobilizado" },
      { key: "anc_intangivel", label: "Intangível" },
      { key: "anc_investimentos", label: "Investimentos" },
      { key: "anc_outros", label: "Outros ativos não circulantes" },
    ],
  },
  {
    id: "pc",
    title: "Passivo Circulante",
    side: "passivo",
    fields: [
      { key: "pc_fornecedores", label: "Fornecedores" },
      { key: "pc_emprestimos_curto", label: "Empréstimos de curto prazo" },
      { key: "pc_obrigacoes_trabalhistas", label: "Obrigações trabalhistas" },
      { key: "pc_obrigacoes_tributarias", label: "Obrigações tributárias" },
      { key: "pc_outros", label: "Outros passivos circulantes" },
    ],
  },
  {
    id: "pnc",
    title: "Passivo Não Circulante",
    side: "passivo",
    fields: [
      { key: "pnc_emprestimos_longo", label: "Empréstimos de longo prazo" },
      { key: "pnc_parcelamentos_tributarios", label: "Parcelamentos tributários" },
      { key: "pnc_outros", label: "Outros passivos não circulantes" },
    ],
  },
  {
    id: "pl",
    title: "Patrimônio Líquido",
    side: "passivo",
    fields: [
      { key: "pl_capital_social", label: "Capital social" },
      { key: "pl_lucros_acumulados", label: "Lucros / prejuízos acumulados" },
      { key: "pl_resultado_periodo", label: "Resultado do período" },
    ],
  },
];

export const BALANCE_KEYS: string[] = BALANCE_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));

export type BalanceValues = Record<string, number>;

export function emptyBalance(): BalanceValues {
  return Object.fromEntries(BALANCE_KEYS.map((k) => [k, 0]));
}

export function sectionTotal(values: BalanceValues, id: BalanceSection["id"]): number {
  const s = BALANCE_SECTIONS.find((x) => x.id === id)!;
  return s.fields.reduce((sum, f) => sum + (Number(values[f.key]) || 0), 0);
}

export interface BalanceTotals {
  ac: number;
  anc: number;
  pc: number;
  pnc: number;
  pl: number;
  ativo: number;
  passivo: number;
  passivoMaisPl: number;
  diferenca: number;
}

export function balanceTotals(values: BalanceValues): BalanceTotals {
  const ac = sectionTotal(values, "ac");
  const anc = sectionTotal(values, "anc");
  const pc = sectionTotal(values, "pc");
  const pnc = sectionTotal(values, "pnc");
  const pl = sectionTotal(values, "pl");
  const ativo = ac + anc;
  const passivo = pc + pnc;
  return { ac, anc, pc, pnc, pl, ativo, passivo, passivoMaisPl: passivo + pl, diferenca: ativo - (passivo + pl) };
}

// ---------------------------------------------------------------------------
// Índices econômico-financeiros
// ---------------------------------------------------------------------------

export type IndexVerdict = "bom" | "atencao" | "critico" | "indefinido";

export interface FinancialIndex {
  key: string;
  label: string;
  value: number | null;
  format: "ratio" | "percent" | "currency" | "days";
  verdict: IndexVerdict;
  hint: string;
  /** Requer balanço preenchido. */
  needsBalance: boolean;
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function verdictFrom(
  value: number | null,
  good: number,
  warn: number,
  higherIsBetter = true,
): IndexVerdict {
  if (value === null || !isFinite(value)) return "indefinido";
  if (higherIsBetter) {
    if (value >= good) return "bom";
    if (value >= warn) return "atencao";
    return "critico";
  }
  if (value <= good) return "bom";
  if (value <= warn) return "atencao";
  return "critico";
}

export interface IndexInput {
  dre: DreMonth;
  balance: BalanceValues | null;
  /** Receita bruta em aberto (recebíveis) do período, para prazo médio. */
  receivablesOpen?: number;
  /** Meses considerados no DRE (para média de ponto de equilíbrio). */
  months?: number;
}

export function computeIndexes({
  dre,
  balance,
  receivablesOpen = 0,
  months = 1,
}: IndexInput): FinancialIndex[] {
  const t = balance ? balanceTotals(balance) : null;
  const receita = dre.receitaBruta;
  const margemContribuicao = receita > 0 ? (receita - dre.despesasVariaveis) / receita : 0;
  const pontoEquilibrio = margemContribuicao > 0 ? dre.despesasFixas / margemContribuicao : null;

  const liquidezCorrente = t ? div(t.ac, t.pc) : null;
  const liquidezSeca = t
    ? div(t.ac - (Number(balance?.["ac_estoques"]) || 0), t.pc)
    : null;
  const liquidezImediata = t
    ? div(
        (Number(balance?.["ac_caixa_bancos"]) || 0) + (Number(balance?.["ac_aplicacoes"]) || 0),
        t.pc,
      )
    : null;
  const endividamento = t ? div(t.passivo, t.ativo) : null;
  const composicao = t ? div(t.pc, t.passivo) : null;

  const list: FinancialIndex[] = [
    {
      key: "liquidez_corrente",
      label: "Liquidez corrente",
      value: liquidezCorrente,
      format: "ratio",
      verdict: verdictFrom(liquidezCorrente, 1.5, 1),
      hint: "Ativo circulante ÷ passivo circulante. Acima de 1,5 é confortável.",
      needsBalance: true,
    },
    {
      key: "liquidez_seca",
      label: "Liquidez seca",
      value: liquidezSeca,
      format: "ratio",
      verdict: verdictFrom(liquidezSeca, 1.2, 0.8),
      hint: "Igual à corrente, sem estoques.",
      needsBalance: true,
    },
    {
      key: "liquidez_imediata",
      label: "Liquidez imediata",
      value: liquidezImediata,
      format: "ratio",
      verdict: verdictFrom(liquidezImediata, 0.4, 0.2),
      hint: "Caixa e aplicações ÷ passivo circulante.",
      needsBalance: true,
    },
    {
      key: "endividamento",
      label: "Endividamento geral",
      value: endividamento === null ? null : endividamento * 100,
      format: "percent",
      verdict: verdictFrom(endividamento === null ? null : endividamento * 100, 50, 70, false),
      hint: "Passivo total ÷ ativo total. Quanto menor, melhor.",
      needsBalance: true,
    },
    {
      key: "composicao_endividamento",
      label: "Composição do endividamento",
      value: composicao === null ? null : composicao * 100,
      format: "percent",
      verdict: verdictFrom(composicao === null ? null : composicao * 100, 50, 75, false),
      hint: "Parcela da dívida que vence no curto prazo.",
      needsBalance: true,
    },
    {
      key: "margem_bruta",
      label: "Margem bruta",
      value: receita > 0 ? (dre.lucroBruto / receita) * 100 : null,
      format: "percent",
      verdict: verdictFrom(receita > 0 ? (dre.lucroBruto / receita) * 100 : null, 40, 20),
      hint: "Lucro bruto ÷ receita bruta.",
      needsBalance: false,
    },
    {
      key: "margem_operacional",
      label: "Margem operacional",
      value: receita > 0 ? (dre.resultadoOperacional / receita) * 100 : null,
      format: "percent",
      verdict: verdictFrom(receita > 0 ? (dre.resultadoOperacional / receita) * 100 : null, 15, 5),
      hint: "Resultado operacional ÷ receita bruta.",
      needsBalance: false,
    },
    {
      key: "margem_liquida",
      label: "Margem líquida",
      value: receita > 0 ? (dre.resultadoLiquido / receita) * 100 : null,
      format: "percent",
      verdict: verdictFrom(receita > 0 ? (dre.resultadoLiquido / receita) * 100 : null, 10, 3),
      hint: "Resultado líquido ÷ receita bruta.",
      needsBalance: false,
    },
    {
      key: "roe",
      label: "Rentabilidade do patrimônio",
      value: t && t.pl > 0 ? (dre.resultadoLiquido / t.pl) * 100 : null,
      format: "percent",
      verdict: verdictFrom(t && t.pl > 0 ? (dre.resultadoLiquido / t.pl) * 100 : null, 10, 3),
      hint: "Resultado líquido ÷ patrimônio líquido.",
      needsBalance: true,
    },
    {
      key: "roa",
      label: "Rentabilidade do ativo",
      value: t && t.ativo > 0 ? (dre.resultadoLiquido / t.ativo) * 100 : null,
      format: "percent",
      verdict: verdictFrom(t && t.ativo > 0 ? (dre.resultadoLiquido / t.ativo) * 100 : null, 8, 2),
      hint: "Resultado líquido ÷ ativo total.",
      needsBalance: true,
    },
    {
      key: "ponto_equilibrio",
      label: "Ponto de equilíbrio",
      value: pontoEquilibrio,
      format: "currency",
      verdict:
        pontoEquilibrio === null
          ? "indefinido"
          : receita >= pontoEquilibrio
            ? "bom"
            : receita >= pontoEquilibrio * 0.8
              ? "atencao"
              : "critico",
      hint: "Receita necessária para cobrir despesas fixas.",
      needsBalance: false,
    },
    {
      key: "prazo_medio_recebimento",
      label: "Prazo médio de recebimento",
      value: receita > 0 ? (receivablesOpen / receita) * 30 * Math.max(1, months) : null,
      format: "days",
      verdict: verdictFrom(
        receita > 0 ? (receivablesOpen / receita) * 30 * Math.max(1, months) : null,
        30,
        60,
        false,
      ),
      hint: "Recebíveis em aberto convertidos em dias de faturamento.",
      needsBalance: false,
    },
  ];
  return list;
}
