import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatPercent } from "@/lib/br-format";
import { computeUpdated } from "@/lib/finance";
import { PAYABLE_TYPES, RECEIVABLE_TYPES } from "@/lib/efo-schema";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — EFO" }] }),
  component: DashboardPage,
});

interface Tx {
  id: string;
  company_id: string | null;
  movement_type: string;
  category: string | null;
  cost_center: string | null;
  source_system: string | null;
  original_value: number;
  paid_value: number;
  interest_rate_month: number;
  interest_type: string;
  due_date: string | null;
  payment_date: string | null;
  status: string;
  competence_date: string | null;
}

function DashboardPage() {
  const [companyId, setCompanyId] = useState("__all__");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("__all__");
  const [category, setCategory] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [source, setSource] = useState("");
  const [movType, setMovType] = useState("__all__");

  const { data: companies = [] } = useQuery({
    queryKey: ["dashboard-companies"],
    queryFn: async () =>
      (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const { data: rawTxs = [], isLoading } = useQuery({
    queryKey: ["dashboard-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "id,company_id,movement_type,category,cost_center,source_system,original_value,paid_value,interest_rate_month,interest_type,due_date,payment_date,status,competence_date",
        )
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  const txs = useMemo(
    () =>
      rawTxs.filter((t) => {
        if (companyId !== "__all__" && t.company_id !== companyId) return false;
        if (status !== "__all__" && t.status !== status) return false;
        if (movType !== "__all__" && t.movement_type !== movType) return false;
        if (category && !(t.category ?? "").toLowerCase().includes(category.toLowerCase()))
          return false;
        if (costCenter && !(t.cost_center ?? "").toLowerCase().includes(costCenter.toLowerCase()))
          return false;
        if (source && !(t.source_system ?? "").toLowerCase().includes(source.toLowerCase()))
          return false;
        const ref = t.competence_date || t.due_date;
        if (from && (!ref || ref < from)) return false;
        if (to && (!ref || ref > to)) return false;
        return true;
      }),
    [rawTxs, companyId, status, movType, category, costCenter, source, from, to],
  );

  const stats = computeStats(txs);
  const monthly = groupMonthly(txs);
  const categoriesExp = groupCategories(txs, PAYABLE_TYPES as unknown as string[]);
  // Categorias exclusivas: pago | vencido | a vencer (não conta vencido duas vezes)
  const paidVsOpen = [
    { name: "Pago", value: stats.paid },
    { name: "A vencer", value: stats.upcoming },
    { name: "Vencido", value: stats.overdue },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard financeiro"
        description="Visão geral em tempo real de receitas, despesas, juros e inadimplência."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(companies as { id: string; name: string }[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {["Pago", "Parcial", "Vencido", "A vencer", "Em aberto", "Cancelado"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={movType} onValueChange={setMovType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {[
                  "Receita",
                  "Despesa",
                  "Conta a Receber",
                  "Conta a Pagar",
                  "Parcelamento",
                  "Juros",
                  "Ajuste",
                ].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Filtrar"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Centro de custo</Label>
            <Input
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              placeholder="Filtrar"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Filtrar"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<ArrowDownRight className="h-4 w-4" />}
          label="Total a receber"
          value={formatBRL(stats.receivable)}
          tone="info"
        />
        <Stat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Total recebido"
          value={formatBRL(stats.paid)}
          tone="success"
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Total vencido"
          value={formatBRL(stats.overdue)}
          tone="destructive"
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="A vencer"
          value={formatBRL(stats.upcoming)}
          tone="warning"
        />
        <Stat
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="Total de despesas"
          value={formatBRL(stats.expenses)}
          tone="destructive"
        />
        <Stat
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo operacional"
          value={formatBRL(stats.operational)}
          tone={stats.operational >= 0 ? "success" : "destructive"}
        />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Juros acumulados"
          value={formatBRL(stats.interest)}
          tone="warning"
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Inadimplência"
          value={formatPercent(stats.overdueRate * 100)}
          tone={stats.overdueRate > 0.1 ? "destructive" : "info"}
        />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Ticket médio"
          value={formatBRL(stats.avgTicket)}
          tone="info"
        />
        <Stat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Taxa de recebimento"
          value={formatPercent(stats.collectionRate * 100)}
          tone={stats.collectionRate >= 0.8 ? "success" : "warning"}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="DSO (dias médios)"
          value={`${stats.dso.toFixed(0)}d`}
          tone={stats.dso > 45 ? "destructive" : "info"}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Margem operacional"
          value={formatPercent(stats.margin * 100)}
          tone={stats.margin >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="grid gap-4 mt-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receitas x Despesas por mês</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar
                  dataKey="receitas"
                  name="Receitas"
                  fill="var(--success)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="despesas"
                  name="Despesas"
                  fill="var(--destructive)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fluxo de caixa mensal</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RLineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke="var(--primary)"
                  strokeWidth={2}
                />
              </RLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pago x Em aberto x Vencido</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paidVsOpen} dataKey="value" nameKey="name" outerRadius={90} label>
                  {paidVsOpen.map((_, i) => (
                    <Cell
                      key={i}
                      fill={["var(--success)", "var(--info)", "var(--destructive)"][i]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias — Despesas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoriesExp} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="name" fontSize={12} width={120} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="value" fill="var(--destructive)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground mt-6">Carregando dados...</p> : null}
      {!isLoading && txs.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum lançamento registrado. Comece cadastrando um cliente e um lançamento financeiro.
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "success" | "destructive" | "warning" | "info";
}) {
  const toneMap = {
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
    info: "text-info",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs font-medium ${toneMap[tone]}`}>
          {icon}
          <span className="uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function computeStats(txs: Tx[]) {
  let receivable = 0;
  let paid = 0;
  let overdue = 0;
  let upcoming = 0;
  let expenses = 0;
  let revenues = 0;
  let interest = 0;
  let receivableCount = 0;
  let dsoSum = 0;
  let dsoCount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const t of txs) {
    const info = computeUpdated({
      principal: Number(t.original_value),
      monthlyRatePct: Number(t.interest_rate_month),
      type: (t.interest_type as "simple" | "compound") || "simple",
      dueDate: t.due_date,
      paymentDate: t.payment_date,
      paid: Number(t.paid_value),
    });
    interest += info.interest;
    const isReceivable = (RECEIVABLE_TYPES as unknown as string[]).includes(t.movement_type);
    const isExpense = (PAYABLE_TYPES as unknown as string[]).includes(t.movement_type);
    if (isReceivable) {
      revenues += info.principal;
      receivable += info.open + Number(t.paid_value);
      paid += Number(t.paid_value);
      receivableCount += 1;
      if (t.due_date) {
        const due = new Date(t.due_date + "T00:00:00");
        if (due < today && info.open > 0) overdue += info.open;
        else if (info.open > 0) upcoming += info.open;
        if (t.payment_date) {
          const pay = new Date(t.payment_date + "T00:00:00");
          const diff = Math.max(0, Math.round((pay.getTime() - due.getTime()) / 86400000));
          dsoSum += diff;
          dsoCount += 1;
        }
      }
    }
    if (isExpense) expenses += info.principal;
  }
  const operational = revenues - expenses;
  const overdueRate = receivable > 0 ? overdue / receivable : 0;
  const avgTicket = receivableCount > 0 ? revenues / receivableCount : 0;
  const collectionRate = receivable > 0 ? paid / receivable : 0;
  const dso = dsoCount > 0 ? dsoSum / dsoCount : 0;
  const margin = revenues > 0 ? operational / revenues : 0;
  return {
    receivable,
    paid,
    overdue,
    upcoming,
    expenses,
    revenues,
    operational,
    interest,
    overdueRate,
    open: receivable - paid,
    avgTicket,
    collectionRate,
    dso,
    margin,
  };
}

function groupMonthly(txs: Tx[]) {
  const map = new Map<
    string,
    { month: string; receitas: number; despesas: number; saldo: number }
  >();
  for (const t of txs) {
    const d = t.competence_date || t.due_date;
    if (!d) continue;
    const key = d.slice(0, 7);
    const cur = map.get(key) ?? { month: key, receitas: 0, despesas: 0, saldo: 0 };
    if ((RECEIVABLE_TYPES as unknown as string[]).includes(t.movement_type)) {
      cur.receitas += Number(t.original_value);
    } else if ((PAYABLE_TYPES as unknown as string[]).includes(t.movement_type)) {
      cur.despesas += Number(t.original_value);
    }
    cur.saldo = cur.receitas - cur.despesas;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function groupCategories(txs: Tx[], types: string[]) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (!types.includes(t.movement_type)) continue;
    const name = t.category || "Sem categoria";
    map.set(name, (map.get(name) ?? 0) + Number(t.original_value));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}
