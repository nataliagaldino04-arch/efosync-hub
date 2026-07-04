// Brazilian formatting helpers.

export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value + (typeof value === "string" && value.length === 10 ? "T00:00:00" : ""));
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
  let s = String(input).trim().replace(/[R$\s]/g, "");
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
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Parse dates: "12/06/2026" | "2026-06-12" | "12/jun" | Date */
export function parseBRDate(input: string | Date | null | undefined, defaultYear?: number): string | null {
  if (!input) return null;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const s = String(input).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy or dd/mm/yy
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yr = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // dd/mmm ex: 12/jun
  const dmm = s.match(/^(\d{1,2})\/([a-zA-Zç]+)(?:\/(\d{2,4}))?$/);
  if (dmm) {
    const [, d, mn, y] = dmm;
    const m = MONTHS_PT[mn.slice(0, 3).toLowerCase()];
    if (m) {
      const yr = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : (defaultYear ?? new Date().getFullYear());
      return `${yr}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  return null;
}

/** Boolean-ish strings: pago, sim, yes, 1 => true */
export function parseBRBoolean(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  const s = String(input ?? "").trim().toLowerCase();
  return ["pago", "sim", "yes", "y", "s", "true", "1"].includes(s);
}