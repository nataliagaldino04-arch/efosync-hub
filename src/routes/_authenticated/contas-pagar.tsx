import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Contas a Pagar"
      description="Visualize e gerencie apenas as despesas e contas a pagar."
      features={["Filtro automático por tipo Despesa e Conta a Pagar", "Ordenação por vencimento", "Marcação rápida como pago"]}
    />
  ),
});