import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, parseBRNumber } from "@/lib/br-format";
import { calcInterest, daysBetween } from "@/lib/finance";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/simulador")({
  head: () => ({ meta: [{ title: "Simulador de Juros — EFO" }] }),
  component: SimuladorPage,
});

function SimuladorPage() {
  const [principal, setPrincipal] = useState("10.000,00");
  const [rate, setRate] = useState("10");
  const [type, setType] = useState<"simple" | "compound">("simple");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [manualDays, setManualDays] = useState("");
  const [paid, setPaid] = useState("0");

  const result = useMemo(() => {
    const p = parseBRNumber(principal);
    const r = parseBRNumber(rate);
    const paidNum = parseBRNumber(paid);
    let days = 0;
    if (manualDays) {
      days = Math.max(0, Math.floor(parseBRNumber(manualDays)));
    } else if (startDate && endDate) {
      days = Math.max(0, daysBetween(new Date(endDate + "T00:00:00"), new Date(startDate + "T00:00:00")));
    }
    const interest = calcInterest(p, r, days, type);
    const updated = p + interest;
    const open = Math.max(0, updated - paidNum);
    // Evolution: month by month
    const months = Math.max(1, Math.ceil(days / 30));
    const evolution: { mes: string; principal: number; juros: number; total: number }[] = [];
    for (let m = 0; m <= months; m++) {
      const d = m * 30;
      const j = calcInterest(p, r, d, type);
      evolution.push({ mes: `M${m}`, principal: p, juros: j, total: p + j });
    }
    return { p, r, days, interest, updated, paid: paidNum, open, evolution };
  }, [principal, rate, type, startDate, endDate, manualDays, paid]);

  return (
    <>
      <PageHeader
        title="Simulador de juros"
        description="Simule juros simples ou compostos e veja a evolução mês a mês."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Parâmetros</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Valor principal</Label><Input value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
            <div className="space-y-2"><Label>Taxa de juros (% ao mês)</Label><Input value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Tipo de juros</Label>
              <Select value={type} onValueChange={(v) => setType(v as "simple" | "compound")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simples</SelectItem>
                  <SelectItem value="compound">Composto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Data inicial</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div className="space-y-2"><Label>Data final</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Ou dias de atraso (opcional)</Label><Input value={manualDays} onChange={(e) => setManualDays(e.target.value)} placeholder="ex: 45" /></div>
            <div className="space-y-2"><Label>Valor pago (opcional)</Label><Input value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
            <Button className="w-full" onClick={() => { /* live compute */ }}>Recalcular</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Metric label="Valor principal" value={formatBRL(result.p)} />
              <Metric label="Taxa aplicada" value={`${result.r}% ao mês (${type === "simple" ? "simples" : "composto"})`} />
              <Metric label="Dias de atraso" value={`${result.days} dias`} />
              <Metric label="Juros calculado" value={formatBRL(result.interest)} tone="warning" />
              <Metric label="Valor pago" value={formatBRL(result.paid)} tone="success" />
              <Metric label="Valor atualizado" value={formatBRL(result.updated)} tone="info" />
              <Metric label="Saldo em aberto" value={formatBRL(result.open)} tone={result.open > 0 ? "destructive" : "success"} />
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.evolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Valor atualizado" stroke="var(--primary)" strokeWidth={2} />
                  <Line type="monotone" dataKey="juros" name="Juros" stroke="var(--warning)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.evolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Bar dataKey="principal" name="Principal" stackId="a" fill="var(--info)" />
                  <Bar dataKey="juros" name="Juros" stackId="a" fill="var(--warning)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" | "warning" | "info" }) {
  const toneMap: Record<string, string> = {
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
    info: "text-info",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold mt-1 ${tone ? toneMap[tone] : ""}`}>{value}</div>
    </div>
  );
}