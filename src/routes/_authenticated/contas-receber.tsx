import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({ meta: [{ title: "Contas a Receber — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Contas a Receber"
      description="Visualize e gerencie apenas os recebíveis."
      features={["Filtro automático por tipo Receita e Conta a Receber", "Ranking de clientes com maior atraso", "Recálculo de juros em massa"]}
    />
  ),
});