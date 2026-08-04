// Brazilian formatting helpers.

export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d =
    value instanceof Date
      ? value
      : new Date(value + (typeof value === "string" && value.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Parse Brazilian currency / number strings: "R$ 1.234,56" | "1.234,56" | "1234,56" | "1234.56" */
export function parseBRNumber(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return input;
  let s = String(input)
    .trim()
    .replace(/[R$\s]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

const MONTHS_PT: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

/** Parse dates: "12/06/2026" | "2026-06-12" | "12/jun" | Date */
export function parseBRDate(
  input: string | Date | null | undefined,
  defaultYear?: number,
): string | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  if (!s) return null;
  // Serial number do Excel (raro; xlsx costuma converter). 1900-01-01 = 1
  if (/^\d+(?:\.\d+)?$/.test(s) && Number(s) > 59 && Number(s) < 60000) {
    const serial = Number(s);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // ISO — valida ano/mês/dia (rejeita 2026-02-31 etc.)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // dd/mm/yyyy, dd/mm/yy — com desambiguação para arquivos em formato americano (m/d/yy)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    const yr = y.length === 2 ? 2000 + Number(y) : Number(y);
    const n1 = Number(a);
    const n2 = Number(b);
    // Padrão brasileiro (dia/mês) tem prioridade; só assume mês/dia quando dia/mês é impossível.
    const br = validIsoDate(yr, n2, n1);
    if (br) return br;
    return validIsoDate(yr, n1, n2);
  }
  // dd/mmm ex: 12/jun
  const dmm = s.match(/^(\d{1,2})\/([a-zA-Zç]+)(?:\/(\d{2,4}))?$/);
  if (dmm) {
    const [, d, mn, y] = dmm;
    const m = MONTHS_PT[mn.slice(0, 3).toLowerCase()];
    if (m) {
      const yr = y
        ? y.length === 2
          ? 2000 + Number(y)
          : Number(y)
        : (defaultYear ?? new Date().getFullYear());
      return validIsoDate(yr, m, Number(d));
    }
  }
  return null;
}

function validIsoDate(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse competence periods: "FEV/2026" | "fev/26" | "02/2026" | "2026-02" | "12/06/2026" | Date.
 * Returns the first day of the month in ISO format. "-" / empty => null.
 */
export function parseCompetence(
  input: string | Date | null | undefined,
  defaultYear?: number,
): string | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return parseBRDate(input);
  const s = String(input).trim();
  if (!s || s === "-" || s === "—") return null;
  // MMM/AAAA or MMM-AA (fev/2026)
  const my = s.match(/^([a-zA-Zçã]+)[\s/\-.]+(\d{2,4})$/);
  if (my) {
    const m = MONTHS_PT[my[1].slice(0, 3).toLowerCase()];
    if (m) {
      const y = my[2].length === 2 ? 2000 + Number(my[2]) : Number(my[2]);
      return validIsoDate(y, m, 1);
    }
  }
  // mm/aaaa
  const nm = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (nm) return validIsoDate(Number(nm[2]), Number(nm[1]), 1);
  // aaaa-mm
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return validIsoDate(Number(ym[1]), Number(ym[2]), 1);
  // Only a month name (uses default year)
  const only = MONTHS_PT[s.slice(0, 3).toLowerCase()];
  if (only && /^[a-zA-Zçã]+$/.test(s))
    return validIsoDate(defaultYear ?? new Date().getFullYear(), only, 1);
  // Full date => normalize to first day of its month
  const full = parseBRDate(s, defaultYear);
  if (full) return `${full.slice(0, 7)}-01`;
  return null;
}

/** Boolean-ish strings: pago, sim, yes, 1 => true */
export function parseBRBoolean(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  const s = String(input ?? "")
    .trim()
    .toLowerCase();
  return ["pago", "sim", "yes", "y", "s", "true", "1"].includes(s);
}
