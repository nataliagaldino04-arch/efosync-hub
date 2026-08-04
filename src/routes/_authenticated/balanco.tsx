import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Wand2, Copy, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/br-format";
import { computeUpdated } from "@/lib/finance";
import { RECEIVABLE_TYPES, PAYABLE_TYPES } from "@/lib/efo-schema";
import {
  BALANCE_KEYS,
  BALANCE_SECTIONS,
  balanceTotals,
  emptyBalance,
  sectionTotal,
  type BalanceValues,
} from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/balanco")({
  head: () => ({
    meta: [
      { title: "Balanço Gerencial — EFO" },
      {
        name: "description",
        content:
          "Monte o Balanço Gerencial mensal (Ativo, Passivo e Patrimônio Líquido) do modelo EFO com conferência automática.",
      },
      { property: "og:title", content: "Balanço Gerencial — EFO" },
      {
        property: "og:description",
        content: "Ativo, Passivo e Patrimônio Líquido mês a mês, com conferência automática.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BalancoPage,
});

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2024, i, 1).toLocaleDateString("pt-BR", { month: "long" }),
}));

function pickBalance(row: Record<string, unknown> | null | undefined): BalanceValues {
  const out = emptyBalance();
  if (!row) return out;
  for (const k of BALANCE_KEYS) out[k] = Number(row[k] ?? 0);
  return out;
}

function BalancoPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [companyId, setCompanyId] = useState<string>("all");
  const [values, setValues] = useState<BalanceValues>(emptyBalance());
  const [notes, setNotes] = useState("");
  const [rowId, setRowId] = useState<string | null>(null);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () =>
      (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const { data: sheets = [] } = useQuery({
    queryKey: ["balance-sheets", year, companyId],
    queryFn: async () => {
      let q = supabase.from("balance_sheets").select("*").eq("period_year", year);
      q = companyId === "all" ? q.is("company_id", null) : q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const current = useMemo(
    () =>
      (sheets as Record<string, unknown>[]).find((s) => Number(s.period_month) === month) ?? null,
    [sheets, month],
  );
  const previous = useMemo(() => {
    const pm = month === 1 ? 12 : month - 1;
    if (month === 1) return null;
    return (sheets as Record<string, unknown>[]).find((s) => Number(s.period_month) === pm) ?? null;
  }, [sheets, month]);

  useEffect(() => {
    setValues(pickBalance(current));
    setNotes(String(current?.notes ?? ""));
    setRowId((current?.id as string) ?? null);
  }, [current]);

  // Lançamentos do mês, para a sugestão automática.
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);
  const { data: txs = [] } = useQuery({
    queryKey: ["balance-tx", year, month, companyId],
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("*")
        .lte("due_date", monthEnd)
        .gte("due_date", `${year - 1}-01-01`);
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggestion = useMemo(() => {
    let receber = 0;
    let pagar = 0;
    let caixa = 0;
    for (const t of txs as Record<string, unknown>[]) {
      const info = computeUpdated({
        principal: Number(t.original_value ?? 0),
        monthlyRatePct: Number(t.interest_rate_month ?? 0),
        type: (t.interest_type as "simple" | "compound") || "simple",
        dueDate: (t.due_date as string) ?? null,
        paymentDate: (t.payment_date as string) ?? null,
        paid: Number(t.paid_value ?? 0),
      });
      const type = String(t.movement_type ?? "");
      const isRev = (RECEIVABLE_TYPES as unknown as string[]).includes(type);
      const isExp = (PAYABLE_TYPES as unknown as string[]).includes(type);
      if (isRev) {
        receber += info.open;
        caixa += Number(t.paid_value ?? 0);
      } else if (isExp) {
        pagar += info.open;
        caixa -= Number(t.paid_value ?? 0);
      }
    }
    return { receber, pagar, caixa: Math.max(0, caixa) };
  }, [txs]);

  const totals = balanceTotals(values);
  const fecha = Math.abs(totals.diferenca) < 0.01;

  function setField(key: string, raw: string) {
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    setValues((v) => ({ ...v, [key]: isNaN(n) ? 0 : n }));
  }

  function applySuggestion() {
    setValues((v) => ({
      ...v,
      ac_contas_receber: suggestion.receber,
      ac_caixa_bancos: suggestion.caixa,
      pc_fornecedores: suggestion.pagar,
    }));
    toast.success("Sugestão aplicada — ajuste os valores como precisar");
  }

  function copyPrevious() {
    if (!previous) {
      toast.error("Não há balanço do mês anterior neste ano");
      return;
    }
    setValues(pickBalance(previous));
    toast.success("Valores do mês anterior copiados");
  }

  const save = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const payload = {
        owner_id: user.id,
        company_id: companyId === "all" ? null : companyId,
        period_month: month,
        period_year: year,
        notes: notes || null,
        ...values,
      };
      if (rowId) {
        const { error } = await supabase
          .from("balance_sheets")
          .update(payload as never)
          .eq("id", rowId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("balance_sheets")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        setRowId((data as { id: string }).id);
      }
    },
    onSuccess: () => {
      toast.success("Balanço salvo");
      qc.invalidateQueries({ queryKey: ["balance-sheets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Balanço Gerencial"
        description="Ativo, Passivo e Patrimônio Líquido mês a mês — base dos índices da Análise EFO."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyPrevious}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar mês anterior
            </Button>
            <Button variant="outline" onClick={applySuggestion}>
              <Wand2 className="h-4 w-4 mr-2" />
              Sugerir dos lançamentos
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Mês</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)} className="capitalize">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year - 2, year - 1, year, year + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-52">
            <Label>Cliente / Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consolidado (sem empresa)</SelectItem>
                {(companies as { id: string; name: string }[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            className={`ml-auto rounded-lg border px-4 py-3 flex items-center gap-3 ${
              fecha ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
            }`}
          >
            {fecha ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            <div className="text-sm">
              <div className="font-medium">
                {fecha ? "Ativo = Passivo + Patrimônio" : "Balanço não fecha"}
              </div>
              <div className="text-xs text-muted-foreground">
                Ativo {formatBRL(totals.ativo)} · Passivo + PL {formatBRL(totals.passivoMaisPl)}
                {!fecha && ` · diferença ${formatBRL(totals.diferenca)}`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {BALANCE_SECTIONS.filter((s) => s.side === "ativo").map((s) => (
            <SectionCard key={s.id} section={s} values={values} onChange={setField} />
          ))}
          <Card>
            <CardContent className="p-4 flex items-center justify-between font-semibold">
              <span>Total do Ativo</span>
              <span>{formatBRL(totals.ativo)}</span>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          {BALANCE_SECTIONS.filter((s) => s.side === "passivo").map((s) => (
            <SectionCard key={s.id} section={s} values={values} onChange={setField} />
          ))}
          <Card>
            <CardContent className="p-4 flex items-center justify-between font-semibold">
              <span>Total do Passivo + Patrimônio</span>
              <span>{formatBRL(totals.passivoMaisPl)}</span>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas sobre o fechamento do mês…"
          />
        </CardContent>
      </Card>
    </>
  );
}

function SectionCard({
  section,
  values,
  onChange,
}: {
  section: (typeof BALANCE_SECTIONS)[number];
  values: BalanceValues;
  onChange: (key: string, raw: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{section.title}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {formatBRL(sectionTotal(values, section.id))}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {section.fields.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <Label className="flex-1 text-sm font-normal">{f.label}</Label>
            <Input
              className="w-40 text-right"
              inputMode="decimal"
              value={values[f.key] === 0 ? "" : String(values[f.key])}
              placeholder="0,00"
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
