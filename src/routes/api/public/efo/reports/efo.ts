import { createFileRoute } from "@tanstack/react-router";
import { adminClient, authenticateBearer, corsPreflight, json } from "@/lib/api-auth.server";
import { computeUpdated } from "@/lib/finance";
import { PAYABLE_TYPES, RECEIVABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/api/public/efo/reports/efo")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async ({ request }) => {
        let auth; try { auth = await authenticateBearer(request); } catch (r) { return r as Response; }
        const admin = adminClient();
        const { data, error } = await admin.from("financial_transactions").select("*").eq("owner_id", auth.userId);
        if (error) return json({ error: error.message }, { status: 500 });
        let receitas = 0, despesas = 0, juros = 0, recebido = 0, vencido = 0, aReceber = 0;
        const today = new Date(); today.setHours(0,0,0,0);
        for (const t of data ?? []) {
          const info = computeUpdated({ principal: Number(t.original_value), monthlyRatePct: Number(t.interest_rate_month), type: (t.interest_type as "simple"|"compound"), dueDate: t.due_date, paymentDate: t.payment_date, paid: Number(t.paid_value) });
          juros += info.interest;
          if ((RECEIVABLE_TYPES as unknown as string[]).includes(t.movement_type as string)) {
            receitas += Number(t.original_value);
            recebido += Number(t.paid_value);
            aReceber += info.open;
            if (t.due_date && new Date(t.due_date + "T00:00:00") < today && info.open > 0) vencido += info.open;
          } else if ((PAYABLE_TYPES as unknown as string[]).includes(t.movement_type as string)) {
            despesas += Number(t.original_value);
          }
        }
        const resultado = receitas - despesas;
        const margem = receitas > 0 ? (resultado / receitas) * 100 : 0;
        const inadimplencia = aReceber > 0 ? (vencido / aReceber) * 100 : 0;
        return json({ receitas, despesas, resultado, margem_pct: margem, juros_acumulados: juros, total_recebido: recebido, total_a_receber: aReceber, total_vencido: vencido, inadimplencia_pct: inadimplencia });
      },
    },
  },
});