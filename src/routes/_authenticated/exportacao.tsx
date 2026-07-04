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
import { EFO_HEADERS, toExportRow } from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/exportacao")({
  head: () => ({ meta: [{ title: "Exportação — EFO" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { data: txs = [] } = useQuery({
    queryKey: ["export-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*, companies(name, document)")
        .order("due_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  function exportAll(format: "xlsx" | "csv") {
    const rows = (
      txs as Array<
        Record<string, unknown> & { companies?: { name: string; document?: string } | null }
      >
    ).map((t) => {
      const info = computeUpdated({
        principal: Number(t.original_value),
        monthlyRatePct: Number(t.interest_rate_month),
        type: (t.interest_type as "simple" | "compound") || "simple",
        dueDate: (t.due_date as string) ?? null,
        paymentDate: (t.payment_date as string) ?? null,
        paid: Number(t.paid_value),
      });
      const base = toExportRow(t);
      return {
        ...base,
        // Campos calculados extras (não fazem parte do padrão de importação mas são úteis para relatório)
        juros_calculado: Number(info.interest.toFixed(2)),
        valor_atualizado: Number(info.updated.toFixed(2)),
        em_aberto: Number(info.open.toFixed(2)),
        dias_atraso: info.days,
      };
    });
    const headers = [
      ...EFO_HEADERS,
      "juros_calculado",
      "valor_atualizado",
      "em_aberto",
      "dias_atraso",
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers as string[] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EFO");
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "efo.csv";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, "efo.xlsx");
    }
    toast.success(`${rows.length} lançamentos exportados`);
  }

  function exportTemplate() {
    const example = [
      "EXT-001",
      "Empresa Alfa",
      "12.345.678/0001-99",
      "Conta a Receber",
      "Serviços",
      "CC-01",
      "Consultoria maio",
      "1500,00",
      "0",
      "0",
      "2,5",
      "compound",
      "01/05/2026",
      "10/jun/2026",
      "",
      "1",
      "3",
      "Boleto",
      "Em aberto",
      "Planilha antiga",
      "Contrato #123",
    ];
    const ws = XLSX.utils.aoa_to_sheet([[...EFO_HEADERS], example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_efo.xlsx");
  }

  return (
    <>
      <PageHeader
        title="Exportação"
        description="Baixe seus dados em XLSX ou CSV com todos os campos calculados."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>EFO completo — XLSX</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Todos os lançamentos com juros, valor atualizado e dias de atraso.
            </p>
            <Button className="w-full" onClick={() => exportAll("xlsx")}>
              <Download className="h-4 w-4 mr-2" />
              Baixar XLSX ({txs.length})
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>EFO completo — CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">CSV com separador ; e BOM (Excel BR).</p>
            <Button variant="outline" className="w-full" onClick={() => exportAll("csv")}>
              <Download className="h-4 w-4 mr-2" />
              Baixar CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Modelo de importação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Planilha em branco com todas as colunas aceitas.
            </p>
            <Button variant="outline" className="w-full" onClick={exportTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Baixar modelo
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
