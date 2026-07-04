import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/plano-acao")({
  head: () => ({ meta: [{ title: "Plano de Ação 5W2H — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Plano de Ação 5W2H"
      description="Estruture ações com base nas análises financeiras."
      features={["Campos What, Why, Who, Where, When, How, How much", "Status: Pendente, Em andamento, Concluído, Atrasado, Cancelado", "Cálculo automático de dias restantes", "Criação a partir de problemas identificados nos relatórios"]}
    />
  ),
});