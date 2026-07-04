import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Relatórios"
      description="Relatórios financeiro mensal, contas a receber, juros, EFO e inadimplência."
      features={["Financeiro mensal com comparativo", "Contas a receber por atraso", "Juros por período e por cliente", "Inadimplência classificada por faixa (1-7, 8-15, 16-30, 31-60, 60+)"]}
    />
  ),
});