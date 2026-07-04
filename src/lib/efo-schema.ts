// EFO canonical import/export schema, alias map, validators.
import { parseBRBoolean, parseBRDate, parseBRNumber } from "./br-format";
import { computeUpdated } from "./finance";

export const EFO_HEADERS = [
  "id_externo",
  "cliente_nome",
  "cliente_documento",
  "tipo_movimento",
  "categoria",
  "centro_custo",
  "descricao",
  "valor_original",
  "valor_parcela_pmt",
  "valor_pago",
  "taxa_juros_mes",
  "tipo_juros",
  "data_competencia",
  "data_vencimento",
  "data_pagamento",
  "parcela_numero",
  "parcela_total",
  "forma_pagamento",
  "status",
  "origem_sistema",
  "observacoes",
] as const;
export type EfoHeader = (typeof EFO_HEADERS)[number];

// Aliases (old names / common variations) → canonical
export const HEADER_ALIASES: Record<string, EfoHeader> = {
  // canonical maps to itself
  ...(Object.fromEntries(EFO_HEADERS.map((h) => [h, h])) as Record<string, EfoHeader>),
  // legacy / variants
  cliente: "cliente_nome",
  nome_cliente: "cliente_nome",
  empresa: "cliente_nome",
  documento: "cliente_documento",
  cnpj: "cliente_documento",
  cpf: "cliente_documento",
  tipo: "tipo_movimento",
  movimento: "tipo_movimento",
  cc: "centro_custo",
  descrição: "descricao",
  historico: "descricao",
  histórico: "descricao",
  valor: "valor_original",
  valor_bruto: "valor_original",
  principal: "valor_original",
  valor_parcela: "valor_parcela_pmt",
  parcela: "valor_parcela_pmt",
  pmt: "valor_parcela_pmt",
  // "pago" na planilha original significa STATUS (pago/sim/não). Aliases de valor pago devem ser explícitos.
  pago: "status",
  valor_pago: "valor_pago",
  pago_valor: "valor_pago",
  valor_quitado: "valor_pago",
  taxa: "taxa_juros_mes",
  juros_mes: "taxa_juros_mes",
  juros: "tipo_juros",
  competencia: "data_competencia",
  competência: "data_competencia",
  vencimento: "data_vencimento",
  pagamento: "data_pagamento",
  parcela_num: "parcela_numero",
  num_parcela: "parcela_numero",
  parcelas: "parcela_total",
  qtd_parcelas: "parcela_total",
  forma: "forma_pagamento",
  meio_pagamento: "forma_pagamento",
  situacao: "status",
  situação: "status",
  origem: "origem_sistema",
  sistema: "origem_sistema",
  obs: "observacoes",
  observação: "observacoes",
  observações: "observacoes",
  notas: "observacoes",
};

function normKey(k: string): string {
  return String(k ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.\-/]+/g, "_");
}

/** Suggest canonical mapping from raw file headers. Unknown → "". */
export function autoMapHeaders(fileHeaders: string[]): Record<string, EfoHeader | ""> {
  const map: Record<string, EfoHeader | ""> = {};
  for (const raw of fileHeaders) {
    const nk = normKey(raw);
    const alias = HEADER_ALIASES[nk] ?? HEADER_ALIASES[nk.replace(/s$/, "")];
    map[raw] = alias ?? "";
  }
  return map;
}

export const MOVEMENT_TYPES = [
  "Receita",
  "Despesa",
  "Conta a Receber",
  "Conta a Pagar",
  "Parcelamento",
  "Juros",
  "Ajuste",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const RECEIVABLE_TYPES: MovementType[] = [
  "Receita",
  "Conta a Receber",
  "Parcelamento",
  "Juros",
];
export const PAYABLE_TYPES: MovementType[] = ["Despesa", "Conta a Pagar"];
export const REQUIRE_DUE_DATE: MovementType[] = [
  "Conta a Receber",
  "Conta a Pagar",
  "Parcelamento",
];

export const STATUSES = [
  "Pago",
  "Parcial",
  "Vencido",
  "A vencer",
  "Em aberto",
  "Cancelado",
] as const;
const STATUS_SET = new Set<string>(STATUSES as unknown as string[]);

export interface EfoRow {
  id_externo: string | null;
  cliente_nome: string | null;
  cliente_documento: string | null;
  tipo_movimento: MovementType;
  categoria: string | null;
  centro_custo: string | null;
  descricao: string | null;
  valor_original: number;
  valor_parcela_pmt: number;
  valor_pago: number;
  taxa_juros_mes: number;
  tipo_juros: "simple" | "compound";
  data_competencia: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  forma_pagamento: string | null;
  status: string;
  origem_sistema: string;
  observacoes: string | null;
}

export interface NormalizeOptions {
  defaultYear?: number;
  defaultSource?: string;
}

/** Normalize a single mapped row (canonical keys already). Returns row + errors. */
export function normalizeEfoRow(
  input: Record<string, unknown>,
  opts: NormalizeOptions = {},
): { row: EfoRow; errors: string[] } {
  const errors: string[] = [];
  const get = (k: EfoHeader) => input[k];
  const str = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const cliente_nome = str(get("cliente_nome"));
  const tipoRaw = str(get("tipo_movimento"));
  const tipo_movimento = (tipoRaw as MovementType) ?? "Receita";
  if (!cliente_nome) errors.push("cliente_nome obrigatório");
  if (!tipoRaw) errors.push("tipo_movimento obrigatório");
  else if (!MOVEMENT_TYPES.includes(tipo_movimento))
    errors.push(`tipo_movimento inválido: ${tipoRaw}`);

  const valor_original = parseBRNumber(get("valor_original") as string | number);
  if (!(valor_original > 0)) errors.push("valor_original deve ser > 0");

  const rawVenc = get("data_vencimento");
  const data_vencimento = parseBRDate(rawVenc as string, opts.defaultYear);
  if (rawVenc && !data_vencimento) errors.push(`data_vencimento inválida: ${String(rawVenc)}`);
  if (!data_vencimento && REQUIRE_DUE_DATE.includes(tipo_movimento))
    errors.push("data_vencimento obrigatória para " + tipo_movimento);

  const rawComp = get("data_competencia");
  const data_competencia = parseBRDate(rawComp as string, opts.defaultYear);
  if (rawComp && !data_competencia) errors.push(`data_competencia inválida: ${String(rawComp)}`);
  const rawPag = get("data_pagamento");
  const data_pagamento = parseBRDate(rawPag as string, opts.defaultYear);
  if (rawPag && !data_pagamento) errors.push(`data_pagamento inválida: ${String(rawPag)}`);

  const taxa_juros_mes = parseBRNumber(get("taxa_juros_mes") as string | number);
  if (taxa_juros_mes < 0) errors.push("taxa_juros_mes negativa");
  const valor_pago = parseBRNumber(get("valor_pago") as string | number);
  if (valor_pago < 0) errors.push("valor_pago negativo");
  const valor_parcela_pmt = parseBRNumber(get("valor_parcela_pmt") as string | number);
  if (valor_parcela_pmt < 0) errors.push("valor_parcela_pmt negativo");
  // Valor atualizado = principal + juros calculados até hoje/pagamento
  const juRawEarly = String(get("tipo_juros") ?? "simple")
    .toLowerCase()
    .trim();
  const jurosTipo: "simple" | "compound" =
    juRawEarly === "compound" || juRawEarly === "composto" ? "compound" : "simple";
  const _venc = parseBRDate(rawVenc as string, opts.defaultYear);
  const _pag = parseBRDate(rawPag as string, opts.defaultYear);
  const _updated = computeUpdated({
    principal: valor_original,
    monthlyRatePct: taxa_juros_mes,
    type: jurosTipo,
    dueDate: _venc,
    paymentDate: _pag,
    paid: 0,
  });
  // Tolerância de 1% para arredondamento
  if (valor_pago > _updated.updated * 1.01 && valor_original > 0)
    errors.push(
      `valor_pago (${valor_pago.toFixed(2)}) maior que valor atualizado (${_updated.updated.toFixed(2)})`,
    );

  const juRaw = String(get("tipo_juros") ?? "simple")
    .toLowerCase()
    .trim();
  let tipo_juros: "simple" | "compound" = "simple";
  if (juRaw === "" || juRaw === "simple" || juRaw === "simples") tipo_juros = "simple";
  else if (juRaw === "compound" || juRaw === "composto") tipo_juros = "compound";
  else errors.push(`tipo_juros inválido: ${juRaw}`);

  const pnRaw = get("parcela_numero");
  const ptRaw = get("parcela_total");
  const parcela_numero = pnRaw === "" || pnRaw == null ? null : Number(pnRaw);
  const parcela_total = ptRaw === "" || ptRaw == null ? null : Number(ptRaw);
  if (parcela_numero !== null && (!Number.isFinite(parcela_numero) || parcela_numero < 1))
    errors.push("parcela_numero inválido");
  if (parcela_total !== null && (!Number.isFinite(parcela_total) || parcela_total < 1))
    errors.push("parcela_total inválido");
  if (parcela_numero && parcela_total && parcela_numero > parcela_total)
    errors.push("parcela_numero > parcela_total");

  const rawStatus = str(get("status"));
  let status = rawStatus ?? "Em aberto";
  if (rawStatus) {
    const low = rawStatus.toLowerCase();
    if (parseBRBoolean(rawStatus)) status = "Pago";
    else if (["não", "nao", "no", "0", "false"].includes(low)) status = "Em aberto";
    else if (STATUS_SET.has(rawStatus)) status = rawStatus;
    else {
      // Normaliza capitalização comum
      const cap = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
      if (STATUS_SET.has(cap)) status = cap;
      else errors.push(`status inválido: ${rawStatus}`);
    }
  }
  // Coerência: se marcou pago mas não informou valor_pago, usa valor_original
  const finalPaid = status === "Pago" && valor_pago === 0 ? valor_original : valor_pago;
  if (status === "Pago" && finalPaid < valor_original)
    errors.push("status Pago mas valor_pago menor que valor_original");

  const row: EfoRow = {
    id_externo: str(get("id_externo")),
    cliente_nome,
    cliente_documento: str(get("cliente_documento")),
    tipo_movimento,
    categoria: str(get("categoria")),
    centro_custo: str(get("centro_custo")),
    descricao: str(get("descricao")),
    valor_original,
    valor_parcela_pmt,
    valor_pago: finalPaid,
    taxa_juros_mes,
    tipo_juros,
    data_competencia,
    data_vencimento,
    data_pagamento,
    parcela_numero,
    parcela_total,
    forma_pagamento: str(get("forma_pagamento")),
    status,
    origem_sistema: str(get("origem_sistema")) ?? opts.defaultSource ?? "import",
    observacoes: str(get("observacoes")),
  };
  return { row, errors };
}

/** Convert canonical row → DB payload for financial_transactions. */
export function toDbTransaction(row: EfoRow, ownerId: string, companyId: string | null) {
  return {
    owner_id: ownerId,
    company_id: companyId,
    external_id: row.id_externo,
    movement_type: row.tipo_movimento,
    category: row.categoria,
    cost_center: row.centro_custo,
    description: row.descricao,
    original_value: row.valor_original,
    installment_value: row.valor_parcela_pmt,
    paid_value: row.valor_pago,
    interest_rate_month: row.taxa_juros_mes,
    interest_type: row.tipo_juros,
    competence_date: row.data_competencia,
    due_date: row.data_vencimento,
    payment_date: row.data_pagamento,
    installment_number: row.parcela_numero,
    installment_total: row.parcela_total,
    payment_method: row.forma_pagamento,
    status: row.status,
    source_system: row.origem_sistema,
    notes: row.observacoes,
  };
}

/** Convert DB row → canonical export row (for XLSX/CSV). */
export function toExportRow(
  t: Record<string, unknown> & { companies?: { name?: string; document?: string } | null },
): Record<EfoHeader, unknown> {
  return {
    id_externo: t.external_id ?? "",
    cliente_nome: t.companies?.name ?? "",
    cliente_documento: t.companies?.document ?? "",
    tipo_movimento: t.movement_type ?? "",
    categoria: t.category ?? "",
    centro_custo: t.cost_center ?? "",
    descricao: t.description ?? "",
    valor_original: Number(t.original_value ?? 0),
    valor_parcela_pmt: Number(t.installment_value ?? 0),
    valor_pago: Number(t.paid_value ?? 0),
    taxa_juros_mes: Number(t.interest_rate_month ?? 0),
    tipo_juros: t.interest_type ?? "simple",
    data_competencia: t.competence_date ?? "",
    data_vencimento: t.due_date ?? "",
    data_pagamento: t.payment_date ?? "",
    parcela_numero: t.installment_number ?? "",
    parcela_total: t.installment_total ?? "",
    forma_pagamento: t.payment_method ?? "",
    status: t.status ?? "",
    origem_sistema: t.source_system ?? "",
    observacoes: t.notes ?? "",
  };
}
