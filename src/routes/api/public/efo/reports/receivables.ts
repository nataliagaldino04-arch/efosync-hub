import { createFileRoute } from "@tanstack/react-router";
import { adminClient, authenticateBearer, corsPreflight, json } from "@/lib/api-auth.server";
import { computeUpdated } from "@/lib/finance";
import { RECEIVABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/api/public/efo/reports/receivables")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async ({ request }) => {
        let auth;
        try {
          auth = await authenticateBearer(request);
        } catch (r) {
          return r as Response;
        }
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const admin = adminClient();
        let q = admin
          .from("financial_transactions")
          .select("*,companies(name)")
          .eq("owner_id", auth.userId)
          .in("movement_type", RECEIVABLE_TYPES as unknown as string[]);
        if (from) q = q.gte("due_date", from);
        if (to) q = q.lte("due_date", to);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, { status: 500 });
        const rows = (data ?? []).map((t) => {
          const info = computeUpdated({
            principal: Number(t.original_value),
            monthlyRatePct: Number(t.interest_rate_month),
            type: t.interest_type as "simple" | "compound",
            dueDate: t.due_date,
            paymentDate: t.payment_date,
            paid: Number(t.paid_value),
          });
          return {
            id: t.id,
            cliente: (t as unknown as { companies?: { name: string } }).companies?.name,
            vencimento: t.due_date,
            valor_original: Number(t.original_value),
            juros: info.interest,
            valor_atualizado: info.updated,
            em_aberto: info.open,
            dias_atraso: info.days,
            status: t.status,
          };
        });
        return json({ count: rows.length, rows });
      },
    },
  },
});
