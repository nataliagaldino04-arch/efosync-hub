import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/exportacao")({
  head: () => ({ meta: [{ title: "Exportação — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Exportação de Dados"
      description="Baixe seus dados no padrão oficial EFO em XLSX ou CSV."
      features={["Modelo de importação para outros sistemas", "Exportar lançamentos no padrão EFO", "Relatórios de juros e inadimplência"]}
    />
  ),
});