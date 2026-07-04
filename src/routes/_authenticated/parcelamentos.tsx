import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/parcelamentos")({
  head: () => ({ meta: [{ title: "Parcelamentos — EFO" }] }),
  component: () => (
    <ComingSoon
      title="Parcelamentos / PMT"
      description="Crie um parcelamento completo com PMT, gere parcelas automaticamente e controle pagamentos."
      features={["Cálculo de PMT (Tabela Price)", "Geração automática de parcelas", "Recálculo de juros por parcela vencida", "Impacto imediato de mudança de taxa"]}
    />
  ),
});