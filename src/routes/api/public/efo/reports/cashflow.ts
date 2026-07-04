import { createFileRoute } from "@tanstack/react-router";
import { adminClient, authenticateBearer, corsPreflight, json } from "@/lib/api-auth.server";
import { PAYABLE_TYPES, RECEIVABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/api/public/efo/reports/cashflow")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async ({ request }) => {
        let auth; try { auth = await authenticateBearer(request); } catch (r) { return r as Response; }
        const admin = adminClient();
        const { data, error } = await admin.from("financial_transactions").select("competence_date,due_date,movement_type,original_value,paid_value").eq("owner_id", auth.userId);
        if (error) return json({ error: error.message }, { status: 500 });
        const map = new Map<string, { month: string; entradas: number; saidas: number; saldo: number }>();
        for (const t of data ?? []) {
          const d = (t.competence_date as string) || (t.due_date as string);
          if (!d) continue;
          const key = d.slice(0, 7);
          const cur = map.get(key) ?? { month: key, entradas: 0, saidas: 0, saldo: 0 };
          if ((RECEIVABLE_TYPES as unknown as string[]).includes(t.movement_type as string)) cur.entradas += Number(t.original_value);
          else if ((PAYABLE_TYPES as unknown as string[]).includes(t.movement_type as string)) cur.saidas += Number(t.original_value);
          cur.saldo = cur.entradas - cur.saidas;
          map.set(key, cur);
        }
        return json({ rows: [...map.values()].sort((a, b) => a.month.localeCompare(b.month)) });
      },
    },
  },
});