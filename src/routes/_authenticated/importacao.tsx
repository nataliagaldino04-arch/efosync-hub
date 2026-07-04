import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { formatDateBR } from "@/lib/br-format";
import {
  EFO_HEADERS,
  autoMapHeaders,
  normalizeEfoRow,
  toDbTransaction,
  type EfoHeader,
  type EfoRow,
} from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({ meta: [{ title: "Importação — EFO" }] }),
  component: ImportPage,
});

interface ParsedRow {
  row: number;
  data: EfoRow;
  errors: string[];
}
type Step = "upload" | "mapping" | "preview";

function ImportPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, EfoHeader | "">>({});
  const [defaultYear, setDefaultYear] = useState<number>(new Date().getFullYear());
  const [defaultSource, setDefaultSource] = useState<string>("import");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);

  const { data: batches = [] } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name,document");
      if (error) throw error;
      return data ?? [];
    },
  });

  const companyByName = useMemo(() => {
    const m = new Map<string, { id: string; document?: string | null }>();
    for (const c of companies as { id: string; name: string; document?: string | null }[]) {
      m.set(c.name.toLowerCase().trim(), { id: c.id, document: c.document });
    }
    return m;
  }, [companies]);

  const valid = parsed.filter((r) => r.errors.length === 0);
  const invalid = parsed.filter((r) => r.errors.length > 0);

  function downloadTemplate() {
    const example1 = [
      "EXT-001",
      "Empresa Alfa",
      "12.345.678/0001-99",
      "Receita",
      "Serviços",
      "CC-01",
      "Consultoria mensal",
      "1500,00",
      "0",
      "0",
      "0",
      "simple",
      "01/06/2026",
      "10/06/2026",
      "",
      "",
      "",
      "Pix",
      "Em aberto",
      "Planilha",
      "",
    ];
    const example2 = [
      "EXT-002",
      "Cliente Beta",
      "",
      "Conta a Receber",
      "Serviços",
      "",
      "Parcela 1/3",
      "500,00",
      "500,00",
      "0",
      "2,5",
      "compound",
      "01/06/2026",
      "12/jun/2026",
      "",
      "1",
      "3",
      "Boleto",
      "Em aberto",
      "Planilha",
      "Contrato #123",
    ];
    const ws = XLSX.utils.aoa_to_sheet([[...EFO_HEADERS], example1, example2]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, "modelo_efo.xlsx");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
    });
    if (raw.length === 0) {
      toast.error("Arquivo vazio");
      return;
    }
    const headers = Object.keys(raw[0]);
    setFileHeaders(headers);
    setRawRows(raw);
    setMapping(autoMapHeaders(headers));
    setStep("mapping");
  }

  function runNormalize() {
    const seenExt = new Set<string>();
    const out: ParsedRow[] = rawRows.map((r, i) => {
      const canonical: Record<string, unknown> = {};
      for (const raw of Object.keys(r)) {
        const target = mapping[raw];
        if (target) canonical[target] = r[raw];
      }
      const { row, errors } = normalizeEfoRow(canonical, { defaultYear, defaultSource });
      if (row.id_externo) {
        const key = `${row.origem_sistema}|${row.id_externo}`;
        if (seenExt.has(key)) errors.push("duplicado no arquivo (id_externo)");
        else seenExt.add(key);
      }
      return { row: i + 2, data: row, errors };
    });
    setParsed(out);
    setStep("preview");
  }

  async function ensureCompany(
    name: string,
    doc: string | null,
    ownerId: string,
    cache: Map<string, string>,
  ): Promise<string> {
    const key = name.toLowerCase().trim();
    if (cache.has(key)) return cache.get(key)!;
    const existing = companyByName.get(key);
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("companies")
      .insert({ name, document: doc, owner_id: ownerId })
      .select("id")
      .single();
    if (error) throw error;
    cache.set(key, data.id);
    return data.id;
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const batch = await supabase
        .from("import_batches")
        .insert({
          owner_id: user.id,
          file_name: fileName,
          total_rows: parsed.length,
          imported_rows: valid.length,
          error_rows: invalid.length,
          status: "completed",
          source_system: defaultSource,
        })
        .select()
        .single();
      if (batch.error) throw batch.error;
      const batchId = batch.data.id;
      if (invalid.length > 0) {
        await supabase.from("import_errors").insert(
          invalid.map((r) => ({
            batch_id: batchId,
            owner_id: user.id,
            row_number: r.row,
            error_message: r.errors.join("; "),
            raw_data: r.data as unknown as never,
          })) as never,
        );
      }
      if (valid.length > 0) {
        const cache = new Map<string, string>();
        const payload = [] as ReturnType<typeof toDbTransaction>[];
        for (const r of valid) {
          const companyId = r.data.cliente_nome
            ? await ensureCompany(r.data.cliente_nome, r.data.cliente_documento, user.id, cache)
            : null;
          payload.push(toDbTransaction(r.data, user.id, companyId));
        }
        // Somente registros com external_id usam upsert (índice único parcial existe apenas quando external_id IS NOT NULL).
        const withExt = payload.filter((p) => p.external_id);
        const withoutExt = payload.filter((p) => !p.external_id);
        if (withExt.length > 0) {
          const { error } = await supabase
            .from("financial_transactions")
            .upsert(withExt as never, {
              onConflict: "owner_id,source_system,external_id",
              ignoreDuplicates: false,
            });
          if (error) throw error;
        }
        if (withoutExt.length > 0) {
          const { error } = await supabase
            .from("financial_transactions")
            .insert(withoutExt as never);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(`${valid.length} lançamentos importados`);
      setParsed([]);
      setRawRows([]);
      setFileHeaders([]);
      setMapping({});
      setFileName("");
      setStep("upload");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadErrors() {
    const data = invalid.map((r) => ({
      linha: r.row,
      erros: r.errors.join("; "),
      ...(r.data as unknown as Record<string, unknown>),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Erros");
    XLSX.writeFile(wb, "erros_importacao.xlsx");
  }

  return (
    <>
      <PageHeader
        title="Importação de Planilhas"
        description="Importe XLSX/CSV com validação. Aceita moeda BR, datas 12/jun, status pago/sim/não."
        actions={
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Baixar modelo
          </Button>
        }
      />

      {step === "upload" && (
        <Card className="mb-4">
          <CardContent className="p-6">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <span className="font-medium">Selecione um arquivo .xlsx, .xls ou .csv</span>
              <span className="text-xs text-muted-foreground">Passo 1 de 3 — upload</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Mapeamento de colunas — {fileName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Passo 2 de 3 — associe cada coluna do arquivo ao campo oficial do EFO. Campos não
              mapeados serão ignorados.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ano padrão (para datas sem ano, ex: "12/jun")</Label>
                <Input
                  type="number"
                  value={defaultYear}
                  onChange={(e) => setDefaultYear(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sistema origem (origem_sistema)</Label>
                <Input
                  value={defaultSource}
                  onChange={(e) => setDefaultSource(e.target.value)}
                  placeholder="ex: planilha_antiga, erp_x"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coluna do arquivo</TableHead>
                    <TableHead>Amostra</TableHead>
                    <TableHead>Campo EFO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileHeaders.map((h) => (
                    <TableRow key={h}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {String(rawRows[0]?.[h] ?? "")}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[h] || "__ignore__"}
                          onValueChange={(v) =>
                            setMapping({
                              ...mapping,
                              [h]: v === "__ignore__" ? "" : (v as EfoHeader),
                            })
                          }
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__ignore__">— ignorar —</SelectItem>
                            {EFO_HEADERS.map((h2) => (
                              <SelectItem key={h2} value={h2}>
                                {h2}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setFileName("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={runNormalize}>Validar e prosseguir</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && parsed.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Prévia — {parsed.length} linhas</CardTitle>
              <div className="text-sm text-muted-foreground mt-1">
                Passo 3 de 3 — revise e confirme.
                <Badge variant="default" className="bg-success text-success-foreground mr-2">
                  {valid.length} válidas
                </Badge>
                {invalid.length > 0 && (
                  <Badge variant="destructive">{invalid.length} com erro</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Voltar
              </Button>
              {invalid.length > 0 && (
                <Button variant="outline" onClick={downloadErrors}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar erros
                </Button>
              )}
              <Button
                onClick={() => importMut.mutate()}
                disabled={valid.length === 0 || importMut.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar {valid.length} válidas
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 200).map((r) => {
                    const d = r.data;
                    return (
                      <TableRow key={r.row} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell className="max-w-32 truncate">{d.cliente_nome ?? "—"}</TableCell>
                        <TableCell>{d.tipo_movimento}</TableCell>
                        <TableCell className="max-w-48 truncate">{d.descricao ?? ""}</TableCell>
                        <TableCell>{formatDateBR(d.data_vencimento)}</TableCell>
                        <TableCell className="text-right">
                          {d.valor_original.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </TableCell>
                        <TableCell>{d.status}</TableCell>
                        <TableCell>
                          {r.errors.length === 0 ? (
                            <Badge className="bg-success text-success-foreground">OK</Badge>
                          ) : (
                            <span className="text-destructive text-xs">{r.errors.join("; ")}</span>
                          )}
                        </TableCell>
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
        <CardHeader>
          <CardTitle>Histórico de importações</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sucesso</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  batches as {
                    id: string;
                    created_at: string;
                    file_name: string | null;
                    total_rows: number;
                    imported_rows: number;
                    error_rows: number;
                    status: string;
                  }[]
                ).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{b.file_name}</TableCell>
                    <TableCell className="text-right">{b.total_rows}</TableCell>
                    <TableCell className="text-right text-success">{b.imported_rows}</TableCell>
                    <TableCell className="text-right text-destructive">{b.error_rows}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.status}</Badge>
                    </TableCell>
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
