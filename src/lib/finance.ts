// Financial calculations for EFO.

export type InterestType = "simple" | "compound";

export type TransactionStatus =
  | "Pago"
  | "Parcial"
  | "Vencido"
  | "A vencer"
  | "Em aberto"
  | "Cancelado";

export function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Days overdue: if paid, uses payment_date - due_date; else today - due_date. Never negative. */
export function daysOverdue(dueDate: string | null, paymentDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate + "T00:00:00");
  const end = paymentDate ? new Date(paymentDate + "T00:00:00") : new Date();
  const d = daysBetween(end, due);
  return Math.max(0, d);
}

/** Compute interest for a principal given monthly rate (as percent, e.g. 10 for 10%) and days */
export function calcInterest(
  principal: number,
  monthlyRatePct: number,
  days: number,
  type: InterestType = "simple",
): number {
  if (principal <= 0 || monthlyRatePct <= 0 || days <= 0) return 0;
  const rate = monthlyRatePct / 100;
  const months = days / 30;
  if (type === "compound") {
    return principal * (Math.pow(1 + rate, months) - 1);
  }
  return principal * rate * months;
}

export interface UpdatedValue {
  principal: number;
  interest: number;
  updated: number;
  paid: number;
  open: number;
  days: number;
}

export function computeUpdated(input: {
  principal: number;
  monthlyRatePct: number;
  type: InterestType;
  dueDate: string | null;
  paymentDate: string | null;
  paid: number;
}): UpdatedValue {
  const days = daysOverdue(input.dueDate, input.paymentDate);
  const interest = calcInterest(input.principal, input.monthlyRatePct, days, input.type);
  const updated = input.principal + interest;
  const open = Math.max(0, updated - input.paid);
  return {
    principal: input.principal,
    interest,
    updated,
    paid: input.paid,
    open,
    days,
  };
}

/** Compute automatic status */
export function computeStatus(input: {
  paid: number;
  updated: number;
  dueDate: string | null;
  paymentDate: string | null;
  canceled?: boolean;
}): TransactionStatus {
  if (input.canceled) return "Cancelado";
  if (input.paid >= input.updated && input.updated > 0) return "Pago";
  if (input.paid > 0 && input.paid < input.updated) return "Parcial";
  if (input.dueDate) {
    const due = new Date(input.dueDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today && input.paid < input.updated) return "Vencido";
    if (due >= today) return "A vencer";
  }
  return "Em aberto";
}

/** PMT installment amount using French system (Price / Tabela Price) */
export function calcPMT(principal: number, monthlyRatePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = monthlyRatePct / 100;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}