import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { formatBRL } from "@/lib/br-format";
import { computeUpdated } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { RECEIVABLE_TYPES } from "@/lib/efo-schema";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — EFO" }] }),
  component: ReportsPage,
});

const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

function ReportsPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(lastDay);
  const [companyId, setCompanyId] = useState<string>("all");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["reports-tx", from, to, companyId],
    queryFn: async () => {
      let q = supabase.from("financial_transactions").select("*, companies(name)")
        .gte("due_date", from).lte("due_date", to);
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const enriched = useMemo(() => (txs as Array<Record<string, unknown> & { companies?: { name: string } | null }>).map((t) => {
    const info = computeUpdated({
      principal: Number(t.original_value),
      monthlyRatePct: Number(t.interest_rate_month),
      type: (t.interest_type as "simple" | "compound") || "simple",
      dueDate: (t.due_date as string) ?? null,
      paymentDate: (t.payment_date as string) ?? null,
      paid: Number(t.paid_value),
    });
    return { ...info, due_date: t.due_date as string | null, companies: t.companies, isRevenue: (RECEIVABLE_TYPES as unknown as string[]).includes(String(t.movement_type)) };
  }), [txs]);

  const monthly = useMemo(() => {
    const map = new Map<string, { mes: string; receitas: number; despesas: number; saldo: number }>();
    for (const t of enriched) {
      const d = String(t.due_date).slice(0, 7);
      const cur = map.get(d) ?? { mes: d, receitas: 0, despesas: 0, saldo: 0 };
      if (t.isRevenue) cur.receitas += t.updated;
      else cur.despesas += t.updated;
      cur.saldo = cur.receitas - cur.despesas;
      map.set(d, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [enriched]);

  const byClient = useMemo(() => {
    const map = new Map<string, { cliente: string; company_id: string | null; total: number; aberto: number; juros: number; qtd: number }>();
    for (const t of enriched) {
      const name = t.companies?.name ?? "Sem cliente";
      const cur = map.get(name) ?? { cliente: name, company_id: null, total: 0, aberto: 0, juros: 0, qtd: 0 };
      cur.total += t.updated;
      cur.aberto += t.open;
      cur.juros += t.interest;
      cur.qtd += 1;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.aberto - a.aberto);
  }, [enriched]);

  async function createAction(c: { cliente: string; aberto: number; juros: number; qtd: number }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Não autenticado"); return; }
    let companyId: string | null = null;
    if (c.cliente !== "Sem cliente") {
      const found = (companies as { id: string; name: string }[]).find((x) => x.name === c.cliente);
      companyId = found?.id ?? null;
    }
    const when = new Date();
    when.setDate(when.getDate() + 7);
    const { error } = await supabase.from("action_plans_5w2h").insert({
      owner_id: user.id,
      company_id: companyId,
      what: `Reduzir inadimplência de ${c.cliente}`,
      why: `${c.qtd} lançamento(s) em aberto totalizando ${formatBRL(c.aberto)} (juros: ${formatBRL(c.juros)}).`,
      who: "Financeiro",
      where_field: "Contas a Receber",
      how: "Contatar cliente, negociar prazos e registrar acordos.",
      how_much: c.aberto,
      when_date: when.toISOString().slice(0, 10),
      status: "Pendente",
      priority: c.aberto > 5000 ? "Alta" : "Normal",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Ação 5W2H criada");
    navigate({ to: "/plano-acao" });
  }

  const aging = useMemo(() => {
    const buckets = [{ faixa: "0", min: 0, max: 0, valor: 0 }, { faixa: "1-30d", min: 1, max: 30, valor: 0 }, { faixa: "31-60d", min: 31, max: 60, valor: 0 }, { faixa: "61-90d", min: 61, max: 90, valor: 0 }, { faixa: "90d+", min: 91, max: Infinity, valor: 0 }];
    for (const t of enriched) {
      if (t.open <= 0 || !t.isRevenue) continue;
      const b = buckets.find((x) => t.days >= x.min && t.days <= x.max);
      if (b) b.valor += t.open;
    }
    return buckets;
  }, [enriched]);

  const totRec = enriched.filter((t) => t.isRevenue).reduce((s, t) => s + t.updated, 0);
  const totDesp = enriched.filter((t) => !t.isRevenue).reduce((s, t) => s + t.updated, 0);

  return (
    <>
      <PageHeader title="Relatórios" description="Análises financeiras por período e cliente." />
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1 min-w-52"><Label>Cliente</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(companies as { id: string; name: string }[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-4 text-right">
            <div><div className="text-xs text-muted-foreground">Receitas</div><div className="text-lg font-semibold text-success">{formatBRL(totRec)}</div></div>
            <div><div className="text-xs text-muted-foreground">Despesas</div><div className="text-lg font-semibold text-destructive">{formatBRL(totDesp)}</div></div>
            <div><div className="text-xs text-muted-foreground">Saldo</div><div className="text-lg font-semibold">{formatBRL(totRec - totDesp)}</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card>
          <CardHeader><CardTitle>Fluxo mensal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" /><YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} /><Legend />
                <Bar dataKey="receitas" fill="var(--success)" name="Receitas" />
                <Bar dataKey="despesas" fill="var(--destructive)" name="Despesas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Inadimplência (aging)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="faixa" /><YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="valor" fill="var(--warning)" name="Em aberto" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ranking por cliente</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
                <TableHead className="text-right">Total atualizado</TableHead>
                <TableHead className="text-right">Juros</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {byClient.map((c) => (
                  <TableRow key={c.cliente}>
                    <TableCell>{c.cliente}</TableCell>
                    <TableCell className="text-right">{c.qtd}</TableCell>
                    <TableCell className="text-right">{formatBRL(c.total)}</TableCell>
                    <TableCell className="text-right text-warning">{formatBRL(c.juros)}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(c.aberto)}</TableCell>
                    <TableCell>
                      {c.aberto > 0 && (
                        <Button size="sm" variant="outline" onClick={() => createAction(c)}>
                          <Target className="h-3.5 w-3.5 mr-1" />5W2H
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}