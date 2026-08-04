import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Download, Upload, FileSpreadsheet, PencilLine } from "lucide-react";
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
import {
  COST_TYPES,
  DRE_GROUPS,
  IMPORT_KINDS,
  detectProfile,
  mapWithProfile,
  normalizeCostType,
  profileById,
  profilesForKind,
  readAoa,
  suggestDreGroup,
  type ImportKind,
  type TargetField,
} from "@/lib/import-profiles";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({
    meta: [
      { title: "Importação de planilhas — EFO" },
      {
        name: "description",
        content:
          "Importe contas a pagar, contas a receber e parcelamentos de qualquer planilha, com detecção automática de layout.",
      },
    ],
  }),
  component: ImportPage,
});

interface ParsedRow {
  row: number;
  index: number;
  data: EfoRow;
  errors: string[];
}
type Step = "upload" | "mapping" | "classify" | "preview";
type Overrides = Record<number, { cliente_nome?: string; categoria?: string }>;
type DreMapEntry = { group: string; costType: string };

const TARGET_FIELDS: TargetField[] = [...EFO_HEADERS, "tipo_custo"];

function ImportPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [kind, setKind] = useState<ImportKind>("contas_pagar");
  const [profileId, setProfileId] = useState<string>("");
  const [detectedLabel, setDetectedLabel] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, TargetField[]>>({});
  const [defaultYear, setDefaultYear] = useState<number>(new Date().getFullYear());
  const [defaultSource, setDefaultSource] = useState<string>("import");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [dreMap, setDreMap] = useState<Record<string, DreMapEntry>>({});

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

  const { data: savedDreMap = [] } = useQuery({
    queryKey: ["dre-category-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_category_map")
        .select("category,dre_group,cost_type");
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

  const profile = profileId ? profileById(profileId) : undefined;

  const dreGroupByCategory = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(dreMap)) out[k] = v.group;
    return out;
  }, [dreMap]);

  const parsed = useMemo<ParsedRow[]>(() => {
    if (rawRows.length === 0) return [];
    const seenExt = new Set<string>();
    return rawRows.map((r, i) => {
      const canonical: Record<string, unknown> = {};
      for (const raw of Object.keys(r)) {
        for (const target of mapping[raw] ?? []) {
          const value = r[raw];
          if (value === "" || value == null) continue;
          if (canonical[target] !== undefined && canonical[target] !== "") {
            if (target === "descricao" || target === "observacoes" || target === "centro_custo")
              canonical[target] = `${canonical[target]} | ${value}`;
          } else {
            canonical[target] = value;
          }
        }
      }
      const ov = overrides[i];
      if (ov?.cliente_nome !== undefined) canonical["cliente_nome"] = ov.cliente_nome;
      if (ov?.categoria !== undefined) canonical["categoria"] = ov.categoria;
      if (canonical["tipo_custo"] !== undefined)
        canonical["tipo_custo"] = normalizeCostType(canonical["tipo_custo"]);
      const { row, errors } = normalizeEfoRow(canonical, {
        defaultYear,
        defaultSource,
        forceMovementType: profile?.forceMovementType,
        paidFromPaymentDate: profile?.paidFromPaymentDate,
        dreGroupByCategory,
      });
      const catKey = (row.categoria ?? "").toLowerCase().trim();
      if (!row.tipo_custo && catKey && dreMap[catKey]?.costType)
        row.tipo_custo = dreMap[catKey].costType;
      if (!row.grupo_dre) row.grupo_dre = "Não classificado";
      if (row.id_externo) {
        const key = `${row.origem_sistema}|${row.id_externo}`;
        if (seenExt.has(key)) errors.push("duplicado no arquivo (id_externo)");
        else seenExt.add(key);
      }
      return { row: i + headerRow + 2, index: i, data: row, errors };
    });
  }, [
    rawRows,
    mapping,
    overrides,
    defaultYear,
    defaultSource,
    profile,
    dreGroupByCategory,
    dreMap,
    headerRow,
  ]);

  const valid = parsed.filter((r) => r.errors.length === 0);
  const invalid = parsed.filter((r) => r.errors.length > 0);

  const categoriesInFile = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of parsed) {
      const c = (p.data.categoria ?? "").trim();
      if (c) set.set(c.toLowerCase(), c);
    }
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [parsed]);

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
    const ws = XLSX.utils.aoa_to_sheet([[...EFO_HEADERS], example1]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, "modelo_efo.xlsx");
  }

  function seedDreMap(cats: string[]) {
    const saved = new Map(
      (savedDreMap as { category: string; dre_group: string; cost_type: string | null }[]).map(
        (r) => [r.category.toLowerCase().trim(), r],
      ),
    );
    setDreMap((prev) => {
      const next = { ...prev };
      for (const c of cats) {
        const key = c.toLowerCase().trim();
        if (next[key]) continue;
        const hit = saved.get(key);
        next[key] = {
          group: hit?.dre_group ?? suggestDreGroup(c),
          costType: hit?.cost_type ?? "",
        };
      }
      return next;
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
      blankrows: false,
    });
    const { headers, rows, headerRow: hr } = readAoa(aoa);
    if (rows.length === 0) {
      toast.error("Nenhuma linha de dados encontrada no arquivo");
      return;
    }
    setFileHeaders(headers);
    setRawRows(rows);
    setHeaderRow(hr);
    setOverrides({});

    const detected = detectProfile(headers, kind) ?? detectProfile(headers);
    if (detected) {
      setProfileId(detected.profile.id);
      setKind(detected.profile.kind);
      setDetectedLabel(detected.profile.label);
      setMapping(mapWithProfile(detected.profile, headers));
    } else {
      setProfileId("");
      setDetectedLabel("");
      const auto = autoMapHeaders(headers);
      setMapping(
        Object.fromEntries(
          headers.map((h) => [h, auto[h] ? [auto[h] as TargetField] : []]),
        ) as Record<string, TargetField[]>,
      );
    }
    setStep("mapping");
  }

  function applyProfile(id: string) {
    setProfileId(id);
    const p = profileById(id);
    if (p) {
      setDetectedLabel(p.label);
      setMapping(mapWithProfile(p, fileHeaders));
    }
  }

  function goToClassify() {
    const cats = new Set<string>();
    for (const r of rawRows) {
      for (const raw of Object.keys(r)) {
        if ((mapping[raw] ?? []).includes("categoria")) {
          const v = String(r[raw] ?? "").trim();
          if (v) cats.add(v);
        }
      }
    }
    seedDreMap([...cats]);
    setStep(cats.size > 0 ? "classify" : "preview");
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

      const mapRows = Object.entries(dreMap)
        .filter(([, v]) => v.group)
        .map(([category, v]) => ({
          owner_id: user.id,
          category,
          dre_group: v.group,
          cost_type: v.costType || null,
        }));
      if (mapRows.length > 0) {
        await supabase
          .from("dre_category_map")
          .upsert(mapRows as never, { onConflict: "owner_id,category" });
      }

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
        const withExt = payload.filter((p) => p.external_id);
        const withoutExt = payload.filter((p) => !p.external_id);
        if (withExt.length > 0) {
          const { error } = await supabase.from("financial_transactions").upsert(withExt as never, {
            onConflict: "dedupe_key",
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
      setRawRows([]);
      setFileHeaders([]);
      setMapping({});
      setOverrides({});
      setFileName("");
      setProfileId("");
      setDetectedLabel("");
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
        description="Aceita modelos de mercado com detecção automática de layout, moeda BR e datas 16/03/26, FEV/2026 ou 12/jun."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/lancamentos">
                <PencilLine className="h-4 w-4 mr-2" />
                Preencher manualmente
              </Link>
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Baixar modelo
            </Button>
          </div>
        }
      />

      {step === "upload" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Passo 1 — o que você vai importar?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    kind === k.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium text-sm">{k.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{k.description}</div>
                </button>
              ))}
            </div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <span className="font-medium">Selecione um arquivo .xlsx, .xls ou .csv</span>
              <span className="text-xs text-muted-foreground">
                O modelo da planilha é reconhecido automaticamente
              </span>
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
            <CardTitle>Passo 2 — modelo e colunas · {fileName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {detectedLabel
                ? `Modelo detectado: ${detectedLabel}. Ajuste se necessário.`
                : "Modelo não reconhecido — associe cada coluna manualmente."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Modelo de importação</Label>
                <Select value={profileId || "__manual__"} onValueChange={applyProfile}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mapeamento manual" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Mapeamento manual</SelectItem>
                    {IMPORT_KINDS.flatMap((k) =>
                      profilesForKind(k.id).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {k.label} · {p.label}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ano padrão (datas sem ano, ex: "12/jun")</Label>
                <Input
                  type="number"
                  value={defaultYear}
                  onChange={(e) => setDefaultYear(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sistema origem</Label>
                <Input
                  value={defaultSource}
                  onChange={(e) => setDefaultSource(e.target.value)}
                  placeholder="ex: planilha_antiga, erp_x"
                />
              </div>
            </div>
            {profile?.forceMovementType && (
              <p className="text-xs text-muted-foreground">
                Todas as linhas serão gravadas como <strong>{profile.forceMovementType}</strong>.
              </p>
            )}
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
                  {fileHeaders.map((h) => {
                    const targets = mapping[h] ?? [];
                    return (
                      <TableRow key={h}>
                        <TableCell className="font-medium">{h}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {String(rawRows[0]?.[h] ?? "")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={targets[0] ?? "__ignore__"}
                              onValueChange={(v) =>
                                setMapping({
                                  ...mapping,
                                  [h]: v === "__ignore__" ? [] : [v as TargetField],
                                })
                              }
                            >
                              <SelectTrigger className="w-64">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__ignore__">— ignorar —</SelectItem>
                                {TARGET_FIELDS.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {targets.length > 1 && (
                              <Badge variant="outline">
                                também → {targets.slice(1).join(", ")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              <Button onClick={goToClassify}>Continuar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "classify" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Passo 3 — grupos do DRE</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cada categoria da planilha alimenta um grupo do DRE do modelo EFO. As sugestões abaixo
              ficam memorizadas para as próximas importações.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria da planilha</TableHead>
                    <TableHead>Grupo do DRE</TableHead>
                    <TableHead>Tipo de custo (quando ausente na planilha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoriesInFile.map(([key, label]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell>
                        <Select
                          value={dreMap[key]?.group ?? "Não classificado"}
                          onValueChange={(v) =>
                            setDreMap((prev) => ({
                              ...prev,
                              [key]: { group: v, costType: prev[key]?.costType ?? "" },
                            }))
                          }
                        >
                          <SelectTrigger className="w-72">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DRE_GROUPS.map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={dreMap[key]?.costType || "__none__"}
                          onValueChange={(v) =>
                            setDreMap((prev) => ({
                              ...prev,
                              [key]: {
                                group: prev[key]?.group ?? "Não classificado",
                                costType: v === "__none__" ? "" : v,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— usar da planilha —</SelectItem>
                            {COST_TYPES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
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
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Voltar
              </Button>
              <Button onClick={() => setStep("preview")}>Validar e prosseguir</Button>
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
                Revise, corrija as pendências direto na tabela e confirme.
                <Badge variant="default" className="bg-success text-success-foreground mx-2">
                  {valid.length} válidas
                </Badge>
                {invalid.length > 0 && (
                  <Badge variant="destructive">{invalid.length} com erro</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(categoriesInFile.length > 0 ? "classify" : "mapping")}
              >
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
                    <TableHead>Cliente / Fornecedor</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Grupo DRE</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 300).map((r) => {
                    const d = r.data;
                    return (
                      <TableRow key={r.row} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-44"
                            value={d.cliente_nome ?? ""}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [r.index]: { ...prev[r.index], cliente_nome: e.target.value },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-40"
                            value={d.categoria ?? ""}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [r.index]: { ...prev[r.index], categoria: e.target.value },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-xs">{d.tipo_custo ?? "—"}</TableCell>
                        <TableCell className="text-xs">{d.grupo_dre}</TableCell>
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
