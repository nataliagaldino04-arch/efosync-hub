import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TxList } from "@/components/tx-list";
import { PAYABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — EFO" }] }),
  component: () => (
    <>
      <PageHeader
        title="Contas a Pagar"
        description="Despesas e contas a pagar com atualização automática de juros."
      />
      <TxList types={PAYABLE_TYPES as unknown as string[]} kind="pagar" />
    </>
  ),
});
