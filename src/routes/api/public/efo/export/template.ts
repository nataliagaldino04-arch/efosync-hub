import { createFileRoute } from "@tanstack/react-router";
import { EFO_HEADERS } from "@/lib/efo-schema";
import { CORS_HEADERS, corsPreflight, json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/efo/export/template")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const format = url.searchParams.get("format") ?? "json";
        if (format === "csv") {
          return new Response(EFO_HEADERS.join(";") + "\n", {
            headers: {
              "content-type": "text/csv;charset=utf-8",
              "content-disposition": 'attachment; filename="modelo_efo.csv"',
              ...CORS_HEADERS,
            },
          });
        }
        return json({
          headers: EFO_HEADERS,
          sample: {
            id_externo: "EXT-001",
            cliente_nome: "Empresa Alfa",
            cliente_documento: "12.345.678/0001-99",
            tipo_movimento: "Conta a Receber",
            categoria: "Serviços",
            centro_custo: "CC-01",
            descricao: "Consultoria",
            valor_original: 1500,
            valor_parcela_pmt: 0,
            valor_pago: 0,
            taxa_juros_mes: 2.5,
            tipo_juros: "compound",
            data_competencia: "2026-05-01",
            data_vencimento: "2026-06-10",
            data_pagamento: null,
            parcela_numero: 1,
            parcela_total: 3,
            forma_pagamento: "Boleto",
            status: "Em aberto",
            origem_sistema: "erp_x",
            observacoes: "Contrato #123",
          },
        });
      },
    },
  },
});
