// Perfis de importação: reconhecem layouts de planilhas de mercado e traduzem
// as colunas para o padrão canônico EFO.
import { EFO_HEADERS, normKey, type EfoHeader, type MovementType } from "./efo-schema";

export type ImportKind = "contas_pagar" | "contas_receber" | "parcelamentos" | "efo";

export const IMPORT_KINDS: { id: ImportKind; label: string; description: string }[] = [
  {
    id: "contas_pagar",
    label: "Contas a Pagar",
    description: "Despesas, fornecedores e custos fixos/variáveis.",
  },
  {
    id: "contas_receber",
    label: "Contas a Receber",
    description: "Receitas e títulos a receber de clientes.",
  },
  {
    id: "parcelamentos",
    label: "Parcelamentos / Financiamentos",
    description: "Contratos parcelados, financiamentos e empréstimos.",
  },
  {
    id: "efo",
    label: "Padrão EFO (21 colunas)",
    description: "Modelo oficial exportado pelo próprio sistema.",
  },
];

/** Campos de destino aceitos por um perfil. */
export type TargetField = EfoHeader | "tipo_custo";

export interface ImportProfile {
  id: string;
  kind: ImportKind;
  label: string;
  /** Cabeçalhos (normalizados) que caracterizam o layout. */
  matchHeaders: string[];
  /** Cabeçalho normalizado do arquivo → um ou mais campos canônicos. */
  columnMap: Record<string, TargetField[]>;
  forceMovementType?: MovementType;
  /** Data de pagamento preenchida marca o lançamento como pago. */
  paidFromPaymentDate?: boolean;
}

const EFO_IDENTITY: Record<string, TargetField[]> = Object.fromEntries(
  EFO_HEADERS.map((h) => [h, [h] as TargetField[]]),
);

export const IMPORT_PROFILES: ImportProfile[] = [
  {
    id: "efo_padrao",
    kind: "efo",
    label: "Padrão EFO (21 colunas)",
    matchHeaders: [...EFO_HEADERS],
    columnMap: EFO_IDENTITY,
  },
  {
    id: "contas_pagar_clinica",
    kind: "contas_pagar",
    label: "Contas a Pagar — Competência/Vencimento/Classificação",
    matchHeaders: [
      "competencia",
      "vencimento",
      "cpf_cnpj_fornecedor",
      "valor",
      "forma_de_pgto",
      "tipo",
      "classificacao",
      "descricao",
      "categoria",
      "pagamento",
      "clinica",
      "observacoes",
      "valor_total",
    ],
    columnMap: {
      competencia: ["data_competencia"],
      vencimento: ["data_vencimento"],
      cpf_cnpj_fornecedor: ["cliente_documento"],
      cpf_cnpj: ["cliente_documento"],
      fornecedor: ["cliente_nome"],
      valor: ["valor_original"],
      valor_total: ["valor_parcela_pmt"],
      forma_de_pgto: ["forma_pagamento"],
      forma_pgto: ["forma_pagamento"],
      tipo: ["tipo_custo"],
      classificacao: ["centro_custo"],
      descricao: ["cliente_nome", "descricao"],
      categoria: ["categoria"],
      pagamento: ["data_pagamento"],
      clinica: ["centro_custo"],
      unidade: ["centro_custo"],
      observacoes: ["observacoes"],
    },
    forceMovementType: "Conta a Pagar",
    paidFromPaymentDate: true,
  },
  {
    id: "contas_receber_generico",
    kind: "contas_receber",
    label: "Contas a Receber — Cliente/Vencimento/Recebimento",
    matchHeaders: ["cliente", "vencimento", "valor", "recebimento", "categoria", "observacoes"],
    columnMap: {
      cliente: ["cliente_nome"],
      nome_cliente: ["cliente_nome"],
      paciente: ["cliente_nome"],
      cpf_cnpj: ["cliente_documento"],
      cpf_cnpj_cliente: ["cliente_documento"],
      documento: ["cliente_documento"],
      competencia: ["data_competencia"],
      vencimento: ["data_vencimento"],
      recebimento: ["data_pagamento"],
      pagamento: ["data_pagamento"],
      valor: ["valor_original"],
      valor_recebido: ["valor_pago"],
      forma_de_pgto: ["forma_pagamento"],
      forma_pgto: ["forma_pagamento"],
      tipo: ["tipo_custo"],
      classificacao: ["centro_custo"],
      categoria: ["categoria"],
      descricao: ["descricao"],
      observacoes: ["observacoes"],
    },
    forceMovementType: "Conta a Receber",
    paidFromPaymentDate: true,
  },
  {
    id: "parcelamentos_generico",
    kind: "parcelamentos",
    label: "Parcelamentos / Financiamentos",
    matchHeaders: [
      "contrato",
      "parcela",
      "parcelas",
      "valor_parcela",
      "vencimento",
      "taxa",
      "credor",
    ],
    columnMap: {
      contrato: ["descricao"],
      descricao: ["descricao"],
      credor: ["cliente_nome"],
      banco: ["cliente_nome"],
      cliente: ["cliente_nome"],
      fornecedor: ["cliente_nome"],
      cpf_cnpj: ["cliente_documento"],
      valor: ["valor_original"],
      valor_parcela: ["valor_parcela_pmt"],
      parcela: ["parcela_numero"],
      parcelas: ["parcela_total"],
      total_parcelas: ["parcela_total"],
      vencimento: ["data_vencimento"],
      competencia: ["data_competencia"],
      pagamento: ["data_pagamento"],
      taxa: ["taxa_juros_mes"],
      taxa_juros: ["taxa_juros_mes"],
      juros: ["taxa_juros_mes"],
      forma_de_pgto: ["forma_pagamento"],
      categoria: ["categoria"],
      classificacao: ["centro_custo"],
      observacoes: ["observacoes"],
    },
    forceMovementType: "Parcelamento",
    paidFromPaymentDate: true,
  },
];

export function profileById(id: string): ImportProfile | undefined {
  return IMPORT_PROFILES.find((p) => p.id === id);
}

export function profilesForKind(kind: ImportKind): ImportProfile[] {
  return IMPORT_PROFILES.filter((p) => p.kind === kind);
}

/** Similaridade simples: proporção dos cabeçalhos do perfil presentes no arquivo. */
export function profileScore(profile: ImportProfile, fileHeaders: string[]): number {
  const set = new Set(fileHeaders.map(normKey));
  const hits = profile.matchHeaders.filter((h) => set.has(h)).length;
  const mapped = fileHeaders.filter((h) => profile.columnMap[normKey(h)]).length;
  const a = hits / Math.max(1, profile.matchHeaders.length);
  const b = mapped / Math.max(1, fileHeaders.length);
  return a * 0.6 + b * 0.4;
}

export function detectProfile(
  fileHeaders: string[],
  kind?: ImportKind,
): { profile: ImportProfile; score: number } | null {
  const pool = kind ? profilesForKind(kind) : IMPORT_PROFILES;
  let best: { profile: ImportProfile; score: number } | null = null;
  for (const p of pool) {
    const score = profileScore(p, fileHeaders);
    if (!best || score > best.score) best = { profile: p, score };
  }
  if (!best || best.score < 0.3) return null;
  return best;
}

/** Mapeamento coluna do arquivo → campos canônicos, segundo o perfil. */
export function mapWithProfile(
  profile: ImportProfile,
  fileHeaders: string[],
): Record<string, TargetField[]> {
  const out: Record<string, TargetField[]> = {};
  for (const raw of fileHeaders) {
    const targets = profile.columnMap[normKey(raw)];
    out[raw] = targets ? [...targets] : [];
  }
  return out;
}

/**
 * Localiza a linha de cabeçalho em uma matriz (ignora linhas vazias/títulos)
 * e devolve cabeçalhos + registros já indexados por cabeçalho.
 */
export function readAoa(aoa: unknown[][]): {
  headers: string[];
  rows: Record<string, unknown>[];
  headerRow: number;
} {
  let headerRow = -1;
  let bestFilled = 0;
  const limit = Math.min(aoa.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? "").trim());
    const filled = cells.filter(Boolean).length;
    const textual = cells.filter((c) => c && !/^-?[\d.,\s]+$/.test(c)).length;
    if (filled >= 2 && textual >= Math.ceil(filled * 0.6) && filled > bestFilled) {
      bestFilled = filled;
      headerRow = i;
    }
  }
  if (headerRow < 0) headerRow = 0;
  const rawHeaders = (aoa[headerRow] ?? []).map((c, idx) => {
    const s = String(c ?? "").trim();
    return s || `coluna_${idx + 1}`;
  });
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const h of rawHeaders) {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    headers.push(n === 1 ? h : `${h} (${n})`);
  }
  const rows: Record<string, unknown>[] = [];
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const line = aoa[i] ?? [];
    if (line.every((c) => String(c ?? "").trim() === "")) continue;
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rec[h] = line[idx] ?? "";
    });
    rows.push(rec);
  }
  return { headers, rows, headerRow };
}

// ---------------------------------------------------------------------------
// Grupos do DRE (modelo EFO)
// ---------------------------------------------------------------------------

export const DRE_GROUPS = [
  "Custo da Venda",
  "Impostos sobre vendas e receitas",
  "Despesas Comerciais",
  "Despesas Administrativas",
  "Despesas com Pessoal",
  "Despesas Tributárias",
  "Dívidas e Investimentos",
  "Receitas",
  "Não classificado",
] as const;
export type DreGroup = (typeof DRE_GROUPS)[number];

export const COST_TYPES = ["Fixo", "Variável"] as const;
export type CostType = (typeof COST_TYPES)[number];

/** Normaliza "Custo Fixo" / "custo variavel" / "variável" → Fixo | Variável | null */
export function normalizeCostType(input: unknown): CostType | null {
  const s = normKey(String(input ?? ""));
  if (!s) return null;
  if (s.includes("fix")) return "Fixo";
  if (s.includes("varia")) return "Variável";
  return null;
}

const GROUP_KEYWORDS: [DreGroup, string[]][] = [
  [
    "Despesas com Pessoal",
    [
      "salario",
      "salarios",
      "pro_labore",
      "prolabore",
      "rh",
      "ferias",
      "fgts",
      "inss_folha",
      "pessoal",
      "vale",
      "rescisao",
      "funcionario",
      "beneficio",
      "13",
      "uniforme",
      "treinamento",
    ],
  ],
  [
    "Despesas Tributárias",
    ["iptu", "ipva", "multa", "licenciamento", "taxa_municipal", "tributaria", "tributo"],
  ],
  [
    "Impostos sobre vendas e receitas",
    ["imposto", "das", "darf", "simples", "iss", "icms", "pis", "cofins", "inss"],
  ],
  [
    "Custo da Venda",
    [
      "material",
      "materiais",
      "laboratorio",
      "protetico",
      "protese",
      "insumo",
      "estoque",
      "mercadoria",
      "cmv",
      "frete",
      "produto",
      "combustivel",
    ],
  ],
  [
    "Despesas Comerciais",
    [
      "marketing",
      "publicidade",
      "propaganda",
      "comissao",
      "comissoes",
      "promocional",
      "campanha",
      "venda",
      "comercial",
    ],
  ],
  [
    "Dívidas e Investimentos",
    [
      "emprestimo",
      "financiamento",
      "investimento",
      "parcelamento",
      "patrimonio",
      "desagio",
      "consorcio",
      "juros_emprestimo",
    ],
  ],
  [
    "Despesas Administrativas",
    [
      "aluguel",
      "energia",
      "agua",
      "internet",
      "telefone",
      "celular",
      "sistema",
      "software",
      "contabil",
      "contabilidade",
      "honorario",
      "advogado",
      "seguro",
      "limpeza",
      "escritorio",
      "manutencao",
      "tarifa",
      "banco",
      "consultoria",
      "administrativa",
      "condominio",
      "servicos",
    ],
  ],
  ["Receitas", ["receita", "faturamento", "servico_prestado", "venda_produto", "recebimento"]],
];

/** Sugere o grupo do DRE a partir do nome da categoria. */
export function suggestDreGroup(category: string | null | undefined): DreGroup {
  const key = normKey(String(category ?? ""));
  if (!key) return "Não classificado";
  for (const [group, words] of GROUP_KEYWORDS) {
    if (words.some((w) => key.includes(w))) return group;
  }
  return "Não classificado";
}
