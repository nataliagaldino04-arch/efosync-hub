import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({ meta: [{ title: "Importação — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Importação de Planilhas"
      description="Importe planilhas XLSX/CSV de outros sistemas com validação e mapeamento de colunas."
      features={["Aceita moeda BR (R$ 1.234,56)", "Datas BR incluindo 12/jun", "Status pago/sim/não", "Prévia + validação antes de salvar", "Histórico de importações e log de erros"]}
    />
  ),
});