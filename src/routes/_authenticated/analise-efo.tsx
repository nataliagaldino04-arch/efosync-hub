import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatBRL, formatPercent } from "@/lib/br-format";
import { computeUpdated } from "@/lib/finance";
import { RECEIVABLE_TYPES, PAYABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/analise-efo")({
  head: () => ({ meta: [{ title: "Análise EFO — EFO" }] }),
  component: EFOPage,
});

const REVENUE_TYPES = RECEIVABLE_TYPES as unknown as string[];
const EXPENSE_TYPES = PAYABLE_TYPES as unknown as string[];
const FIXED_CATS = ["Aluguel", "Energia/Água", "Internet", "Salários", "Sistemas", "Contabilidade"];

function EFOPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [companyId, setCompanyId] = useState<string>("all");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () =>
      (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["efo-tx", year, companyId],
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("*")
        .gte("due_date", `${year}-01-01`)
        .lte("due_date", `${year}-12-31`);
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      label: new Date(year, i, 1).toLocaleDateString("pt-BR", { month: "short" }),
      receitas: 0,
      despesasFixas: 0,
      despesasVariaveis: 0,
      despesas: 0,
      resultado: 0,
      juros: 0,
      margem: 0,
    }));
    for (const t of txs as Array<Record<string, unknown>>) {
      const info = computeUpdated({
        principal: Number(t.original_value),
        monthlyRatePct: Number(t.interest_rate_month),
        type: (t.interest_type as "simple" | "compound") || "simple",
        dueDate: (t.due_date as string) ?? null,
        paymentDate: (t.payment_date as string) ?? null,
        paid: Number(t.paid_value),
      });
      const d = new Date(String(t.due_date) + "T00:00:00");
      if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
      const row = rows[d.getMonth()];
      row.juros += info.interest;
      if (REVENUE_TYPES.includes(String(t.movement_type))) {
        row.receitas += info.updated;
      } else if (EXPENSE_TYPES.includes(String(t.movement_type))) {
        const cat = String(t.category ?? "");
        const costType = String(t.cost_type ?? "").toLowerCase();
        const isFixed = costType ? costType.startsWith("fix") : FIXED_CATS.includes(cat);
        if (isFixed) row.despesasFixas += info.updated;
        else row.despesasVariaveis += info.updated;
        row.despesas += info.updated;
      }
      // Tipos como "Ajuste" não entram automaticamente no DRE.
    }
    for (const r of rows) {
      r.resultado = r.receitas - r.despesas;
      r.margem = r.receitas > 0 ? (r.resultado / r.receitas) * 100 : 0;
    }
    return rows;
  }, [txs, year]);

  const totalRec = monthly.reduce((s, r) => s + r.receitas, 0);
  const totalDesp = monthly.reduce((s, r) => s + r.despesas, 0);
  const totalJuros = monthly.reduce((s, r) => s + r.juros, 0);
  const totalResult = totalRec - totalDesp;
  const margemAvg = totalRec > 0 ? (totalResult / totalRec) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Análise Econômica, Financeira e Operacional"
        description="Comparativo mensal com margem e resultado do exercício."
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ano</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-32">
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
            <label className="text-xs text-muted-foreground">Cliente</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(companies as { id: string; name: string }[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto grid grid-cols-4 gap-4 text-right">
            <Kpi label="Receitas" value={formatBRL(totalRec)} color="text-success" />
            <Kpi label="Despesas" value={formatBRL(totalDesp)} color="text-destructive" />
            <Kpi
              label="Resultado"
              value={formatBRL(totalResult)}
              color={totalResult >= 0 ? "text-success" : "text-destructive"}
            />
            <Kpi
              label="Margem"
              value={formatPercent(margemAvg)}
              color={margemAvg >= 0 ? "text-success" : "text-destructive"}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Evolução mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="receitas"
                stroke="var(--success)"
                strokeWidth={2}
                name="Receitas"
              />
              <Line
                type="monotone"
                dataKey="despesas"
                stroke="var(--destructive)"
                strokeWidth={2}
                name="Despesas"
              />
              <Line
                type="monotone"
                dataKey="resultado"
                stroke="var(--primary)"
                strokeWidth={2}
                name="Resultado"
              />
              <Line
                type="monotone"
                dataKey="juros"
                stroke="var(--warning)"
                strokeWidth={2}
                strokeDasharray="4 4"
                name="Juros"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DRE mensal — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Receitas</TableHead>
                  <TableHead className="text-right">Desp. Fixas</TableHead>
                  <TableHead className="text-right">Desp. Variáveis</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.map((r) => (
                  <TableRow key={r.mes}>
                    <TableCell className="capitalize">{r.label}</TableCell>
                    <TableCell className="text-right text-success">
                      {formatBRL(r.receitas)}
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(r.despesasFixas)}</TableCell>
                    <TableCell className="text-right">{formatBRL(r.despesasVariaveis)}</TableCell>
                    <TableCell className="text-right text-warning">{formatBRL(r.juros)}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${r.resultado >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatBRL(r.resultado)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${r.margem >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatPercent(r.margem)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right text-success">{formatBRL(totalRec)}</TableCell>
                  <TableCell className="text-right">
                    {formatBRL(monthly.reduce((s, r) => s + r.despesasFixas, 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatBRL(monthly.reduce((s, r) => s + r.despesasVariaveis, 0))}
                  </TableCell>
                  <TableCell className="text-right text-warning">{formatBRL(totalJuros)}</TableCell>
                  <TableCell
                    className={`text-right ${totalResult >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {formatBRL(totalResult)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${margemAvg >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {formatPercent(margemAvg)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
