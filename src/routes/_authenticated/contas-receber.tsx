import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TxList } from "@/components/tx-list";
import { RECEIVABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({ meta: [{ title: "Contas a Receber — EFO" }] }),
  component: () => (
    <>
      <PageHeader title="Contas a Receber" description="Recebíveis com juros e valor atualizado automaticamente." />
      <TxList types={RECEIVABLE_TYPES as unknown as string[]} kind="receber" />
    </>
  ),
});