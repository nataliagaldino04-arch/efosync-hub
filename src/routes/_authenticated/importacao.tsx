import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { parseBRBoolean, parseBRDate, parseBRNumber, formatDateBR } from "@/lib/br-format";
import { computeStatus, computeUpdated } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({ meta: [{ title: "Importação — EFO" }] }),
  component: ImportPage,
});

const TEMPLATE_HEADERS = [
  "cliente", "tipo", "categoria", "descricao", "valor_original", "valor_parcela",
  "valor_pago", "taxa_juros_mes", "tipo_juros", "data_competencia", "data_vencimento",
  "data_pagamento", "parcela_num", "parcela_total", "status", "forma_pagamento", "observacoes",
];

interface Row { row: number; data: Record<string, unknown>; errors: string[] }

function ImportPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");

  const { data: batches = [] } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const companyMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies as { id: string; name: string }[]) m.set(c.name.toLowerCase().trim(), c.id);
    return m;
  }, [companies]);

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ["Empresa Alfa", "Receita", "Serviços", "Consultoria mensal", "1500,00", "0", "0", "0", "simple", "01/06/2026", "10/06/2026", "", "", "", "Em aberto", "Pix", ""],
      ["Cliente Beta", "Conta a Receber", "Serviços", "Parcela 1/3", "500,00", "500,00", "0", "2,5", "compound", "01/06/2026", "12/jun/2026", "", "1", "3", "Em aberto", "Boleto", "Contrato #123"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, "modelo_efo.xlsx");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const parsed: Row[] = raw.map((r, i) => {
      const errors: string[] = [];
      const norm: Record<string, unknown> = {};
      for (const k of Object.keys(r)) norm[k.toString().toLowerCase().trim().replace(/[ .]/g, "_")] = r[k];
      const clientName = String(norm["cliente"] ?? "").trim();
      const companyId = clientName ? companyMap.get(clientName.toLowerCase()) ?? null : null;
      if (clientName && !companyId) errors.push(`Cliente "${clientName}" não cadastrado`);
      const movType = String(norm["tipo"] ?? "").trim() || "Receita";
      if (!["Receita", "Despesa", "Conta a Receber", "Conta a Pagar", "Parcelamento", "Juros", "Ajuste"].includes(movType)) errors.push(`Tipo inválido: ${movType}`);
      const orig = parseBRNumber(norm["valor_original"]);
      if (orig <= 0) errors.push("Valor original obrigatório");
      const due = parseBRDate(String(norm["data_vencimento"] ?? ""));
      const comp = parseBRDate(String(norm["data_competencia"] ?? ""));
      const pay = parseBRDate(String(norm["data_pagamento"] ?? ""));
      const rate = parseBRNumber(norm["taxa_juros_mes"]);
      const paid = parseBRNumber(norm["valor_pago"]);
      const rawStatus = String(norm["status"] ?? "").trim();
      let status = rawStatus;
      if (parseBRBoolean(rawStatus)) status = "Pago";
      else if (!rawStatus) status = "Em aberto";
      const it = String(norm["tipo_juros"] ?? "simple").toLowerCase();
      const interestType = it.startsWith("comp") ? "compound" : "simple";
      return {
        row: i + 2,
        data: {
          company_id: companyId,
          movement_type: movType,
          category: String(norm["categoria"] ?? "") || null,
          description: String(norm["descricao"] ?? "") || null,
          original_value: orig,
          installment_value: parseBRNumber(norm["valor_parcela"]),
          paid_value: paid,
          interest_rate_month: rate,
          interest_type: interestType,
          competence_date: comp,
          due_date: due,
          payment_date: pay,
          installment_number: Number(norm["parcela_num"]) || null,
          installment_total: Number(norm["parcela_total"]) || null,
          payment_method: String(norm["forma_pagamento"] ?? "") || null,
          status,
          notes: String(norm["observacoes"] ?? "") || null,
        },
        errors,
      };
    });
    setRows(parsed);
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const batch = await supabase.from("import_batches").insert({
        owner_id: user.id, file_name: fileName, total_rows: rows.length,
        success_rows: valid.length, error_rows: invalid.length, status: "completed",
      }).select().single();
      if (batch.error) throw batch.error;
      const batchId = batch.data.id;
      if (invalid.length > 0) {
        await supabase.from("import_errors").insert(invalid.map((r) => ({
          batch_id: batchId, owner_id: user.id, row_number: r.row,
          error_message: r.errors.join("; "), row_data: r.data,
        })));
      }
      if (valid.length > 0) {
        const payload = valid.map((r) => {
          const d = r.data as Record<string, unknown>;
          const info = computeUpdated({
            principal: Number(d.original_value),
            monthlyRatePct: Number(d.interest_rate_month),
            type: d.interest_type as "simple" | "compound",
            dueDate: (d.due_date as string) ?? null,
            paymentDate: (d.payment_date as string) ?? null,
            paid: Number(d.paid_value),
          });
          const status = d.status === "Cancelado" ? "Cancelado" : computeStatus({
            paid: info.paid, updated: info.updated,
            dueDate: (d.due_date as string) ?? null,
            paymentDate: (d.payment_date as string) ?? null,
          });
          return { ...d, status, owner_id: user.id, source_system: "import" };
        });
        const { error } = await supabase.from("financial_transactions").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${valid.length} lançamentos importados`);
      setRows([]); setFileName("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadErrors() {
    const data = invalid.map((r) => ({ linha: r.row, erros: r.errors.join("; "), ...r.data }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Erros");
    XLSX.writeFile(wb, "erros_importacao.xlsx");
  }

  return (
    <>
      <PageHeader title="Importação de Planilhas" description="Importe XLSX/CSV com validação. Aceita moeda BR, datas 12/jun, status pago/sim/não." actions={
        <Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />Baixar modelo</Button>
      } />

      <Card className="mb-4">
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <span className="font-medium">Selecione um arquivo .xlsx, .xls ou .csv</span>
            <span className="text-xs text-muted-foreground">{fileName || "Nenhum arquivo selecionado"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Prévia — {rows.length} linhas</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                <Badge variant="default" className="bg-success text-success-foreground mr-2">{valid.length} válidas</Badge>
                {invalid.length > 0 && <Badge variant="destructive">{invalid.length} com erro</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              {invalid.length > 0 && <Button variant="outline" onClick={downloadErrors}><Download className="h-4 w-4 mr-2" />Baixar erros</Button>}
              <Button onClick={() => importMut.mutate()} disabled={valid.length === 0 || importMut.isPending}>
                <Upload className="h-4 w-4 mr-2" />Importar {valid.length} válidas
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Linha</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead>
                  <TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead><TableHead>Validação</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r) => {
                    const d = r.data as Record<string, unknown>;
                    return (
                      <TableRow key={r.row} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell>{String(d.movement_type ?? "")}</TableCell>
                        <TableCell className="max-w-48 truncate">{String(d.description ?? "")}</TableCell>
                        <TableCell>{formatDateBR(d.due_date as string)}</TableCell>
                        <TableCell className="text-right">{Number(d.original_value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        <TableCell>{String(d.status ?? "")}</TableCell>
                        <TableCell>{r.errors.length === 0 ? <Badge className="bg-success text-success-foreground">OK</Badge> : <span className="text-destructive text-xs">{r.errors.join("; ")}</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Histórico de importações</CardTitle></CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Arquivo</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Sucesso</TableHead>
                <TableHead className="text-right">Erros</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(batches as { id: string; created_at: string; file_name: string; total_rows: number; success_rows: number; error_rows: number; status: string }[]).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{b.file_name}</TableCell>
                    <TableCell className="text-right">{b.total_rows}</TableCell>
                    <TableCell className="text-right text-success">{b.success_rows}</TableCell>
                    <TableCell className="text-right text-destructive">{b.error_rows}</TableCell>
                    <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}