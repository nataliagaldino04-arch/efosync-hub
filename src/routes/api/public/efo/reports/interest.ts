import { createFileRoute } from "@tanstack/react-router";
import { adminClient, authenticateBearer, corsPreflight, json } from "@/lib/api-auth.server";
import { computeUpdated } from "@/lib/finance";

export const Route = createFileRoute("/api/public/efo/reports/interest")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async ({ request }) => {
        let auth; try { auth = await authenticateBearer(request); } catch (r) { return r as Response; }
        const admin = adminClient();
        const { data, error } = await admin.from("financial_transactions").select("*").eq("owner_id", auth.userId).gt("interest_rate_month", 0);
        if (error) return json({ error: error.message }, { status: 500 });
        let total = 0;
        const rows = (data ?? []).map((t) => {
          const info = computeUpdated({ principal: Number(t.original_value), monthlyRatePct: Number(t.interest_rate_month), type: (t.interest_type as "simple"|"compound"), dueDate: t.due_date, paymentDate: t.payment_date, paid: Number(t.paid_value) });
          total += info.interest;
          return { id: t.id, principal: info.principal, taxa: Number(t.interest_rate_month), tipo: t.interest_type, dias: info.days, juros: info.interest };
        });
        return json({ total_juros: total, count: rows.length, rows });
      },
    },
  },
});