import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TxList } from "@/components/tx-list";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — EFO" }] }),
  component: () => (
    <>
      <PageHeader title="Contas a Pagar" description="Despesas e contas a pagar com atualização automática de juros." />
      <TxList types={["Despesa", "Conta a Pagar"]} kind="pagar" />
    </>
  ),
});