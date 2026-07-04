import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { computeUpdated } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/exportacao")({
  head: () => ({ meta: [{ title: "Exportação — EFO" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { data: txs = [] } = useQuery({
    queryKey: ["export-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_transactions").select("*, companies(name)").order("due_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  function exportAll(format: "xlsx" | "csv") {
    const rows = (txs as Array<Record<string, unknown> & { companies?: { name: string } | null }>).map((t) => {
      const info = computeUpdated({
        principal: Number(t.original_value),
        monthlyRatePct: Number(t.interest_rate_month),
        type: (t.interest_type as "simple" | "compound") || "simple",
        dueDate: (t.due_date as string) ?? null,
        paymentDate: (t.payment_date as string) ?? null,
        paid: Number(t.paid_value),
      });
      return {
        cliente: t.companies?.name ?? "",
        tipo: t.movement_type,
        categoria: t.category,
        descricao: t.description,
        valor_original: Number(t.original_value),
        valor_pago: Number(t.paid_value),
        juros: info.interest,
        valor_atualizado: info.updated,
        em_aberto: info.open,
        taxa_juros_mes: Number(t.interest_rate_month),
        tipo_juros: t.interest_type,
        data_competencia: t.competence_date,
        data_vencimento: t.due_date,
        data_pagamento: t.payment_date,
        parcela_num: t.installment_number,
        parcela_total: t.installment_total,
        forma_pagamento: t.payment_method,
        status: t.status,
        dias_atraso: info.days,
        observacoes: t.notes,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EFO");
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "efo.csv"; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, "efo.xlsx");
    }
    toast.success(`${rows.length} lançamentos exportados`);
  }

  function exportTemplate() {
    const headers = ["cliente","tipo","categoria","descricao","valor_original","valor_parcela","valor_pago","taxa_juros_mes","tipo_juros","data_competencia","data_vencimento","data_pagamento","parcela_num","parcela_total","status","forma_pagamento","observacoes"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_efo.xlsx");
  }

  return (
    <>
      <PageHeader title="Exportação" description="Baixe seus dados em XLSX ou CSV com todos os campos calculados." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>EFO completo — XLSX</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Todos os lançamentos com juros, valor atualizado e dias de atraso.</p>
            <Button className="w-full" onClick={() => exportAll("xlsx")}><Download className="h-4 w-4 mr-2" />Baixar XLSX ({txs.length})</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>EFO completo — CSV</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">CSV com separador ; e BOM (Excel BR).</p>
            <Button variant="outline" className="w-full" onClick={() => exportAll("csv")}><Download className="h-4 w-4 mr-2" />Baixar CSV</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Modelo de importação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Planilha em branco com todas as colunas aceitas.</p>
            <Button variant="outline" className="w-full" onClick={exportTemplate}><Download className="h-4 w-4 mr-2" />Baixar modelo</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}