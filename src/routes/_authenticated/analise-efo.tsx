import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/analise-efo")({
  head: () => ({ meta: [{ title: "Análise EFO — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Análise EFO"
      description="Visão consolidada Econômica, Financeira e Operacional."
      features={["Econômico: receita, despesas, resultado, margem", "Financeiro: contas a receber/pagar, caixa, juros, inadimplência", "Operacional: quantidade de lançamentos, clientes ativos, eficiência de recebimento"]}
    />
  ),
});