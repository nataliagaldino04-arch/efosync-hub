import { createFileRoute } from "@tanstack/react-router";
import { adminClient, authenticateBearer, corsPreflight, json } from "@/lib/api-auth.server";
import { normalizeEfoRow, toDbTransaction, type EfoHeader } from "@/lib/efo-schema";
import {
  mapWithProfile,
  normalizeCostType,
  profileById,
  suggestDreGroup,
} from "@/lib/import-profiles";

interface Body {
  rows: Record<string, unknown>[];
  default_year?: number;
  default_source?: string;
  /** id de um perfil de importação (ex: contas_pagar_clinica) para traduzir cabeçalhos */
  profile?: string;
}

export const Route = createFileRoute("/api/public/efo/import/financial-transactions")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        let auth;
        try {
          auth = await authenticateBearer(request);
        } catch (r) {
          return r as Response;
        }
        let body: Body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid json" }, { status: 400 });
        }
        if (!Array.isArray(body?.rows))
          return json({ error: "rows must be an array" }, { status: 400 });

        const admin = adminClient();
        const { data: existingCompanies } = await admin
          .from("companies")
          .select("id,name")
          .eq("owner_id", auth.userId);
        const cache = new Map<string, string>();
        for (const c of existingCompanies ?? []) cache.set(c.name.toLowerCase().trim(), c.id);

        const errors: { row: number; errors: string[] }[] = [];
        const payload: ReturnType<typeof toDbTransaction>[] = [];

        const profile = body.profile ? profileById(body.profile) : undefined;
        if (body.profile && !profile)
          return json({ error: `perfil desconhecido: ${body.profile}` }, { status: 400 });

        for (let i = 0; i < body.rows.length; i++) {
          const r = body.rows[i];
          let canonical = r as Record<string, unknown>;
          if (profile) {
            const map = mapWithProfile(profile, Object.keys(r));
            const translated: Record<string, unknown> = {};
            for (const [raw, targets] of Object.entries(map)) {
              const value = r[raw];
              if (value === "" || value == null) continue;
              for (const t of targets) {
                if (translated[t] !== undefined && translated[t] !== "") {
                  if (t === "descricao" || t === "observacoes" || t === "centro_custo")
                    translated[t] = `${translated[t]} | ${value}`;
                } else {
                  translated[t] = value;
                }
              }
            }
            if (translated["tipo_custo"] !== undefined)
              translated["tipo_custo"] = normalizeCostType(translated["tipo_custo"]);
            canonical = translated;
          }
          const { row, errors: errs } = normalizeEfoRow(canonical, {
            defaultYear: body.default_year,
            defaultSource: body.default_source ?? "api",
            forceMovementType: profile?.forceMovementType,
            paidFromPaymentDate: profile?.paidFromPaymentDate,
          });
          if (!row.grupo_dre) row.grupo_dre = suggestDreGroup(row.categoria);
          if (errs.length) {
            errors.push({ row: i, errors: errs });
            continue;
          }
          let companyId: string | null = null;
          if (row.cliente_nome) {
            const key = row.cliente_nome.toLowerCase().trim();
            if (cache.has(key)) companyId = cache.get(key)!;
            else {
              const { data, error } = await admin
                .from("companies")
                .insert({
                  owner_id: auth.userId,
                  name: row.cliente_nome,
                  document: row.cliente_documento,
                })
                .select("id")
                .single();
              if (error) {
                errors.push({ row: i, errors: [`falha ao criar cliente: ${error.message}`] });
                continue;
              }
              companyId = data.id;
              cache.set(key, data.id);
            }
          }
          payload.push(toDbTransaction(row, auth.userId, companyId));
        }

        let created: unknown[] = [];
        const withExt = payload.filter((p) => p.external_id);
        const withoutExt = payload.filter((p) => !p.external_id);
        if (withExt.length > 0) {
          const { data, error } = await admin
            .from("financial_transactions")
            .upsert(withExt as never, {
              onConflict: "dedupe_key",
              ignoreDuplicates: false,
            })
            .select("id");
          if (error) return json({ error: error.message, errors }, { status: 500 });
          created = created.concat(data ?? []);
        }
        if (withoutExt.length > 0) {
          const { data, error } = await admin
            .from("financial_transactions")
            .insert(withoutExt as never)
            .select("id");
          if (error) return json({ error: error.message, errors }, { status: 500 });
          created = created.concat(data ?? []);
        }

        return json({
          total: body.rows.length,
          importados: created.length,
          falharam: errors.length,
          erros: errors,
          // aliases em inglês para compatibilidade
          imported: created.length,
          failed: errors.length,
          errors,
        });
      },
    },
  },
});
