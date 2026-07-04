import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { calcPMT } from "@/lib/finance";
import { formatBRL, formatDateBR, parseBRNumber } from "@/lib/br-format";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parcelamentos")({
  head: () => ({ meta: [{ title: "Parcelamentos — EFO" }] }),
  component: ParcelamentosPage,
});

interface Preview { n: number; due: string; value: number; principalPart: number; interestPart: number; balance: number; }

function ParcelamentosPage() {
  const qc = useQueryClient();
  const [principal, setPrincipal] = useState("1000,00");
  const [rate, setRate] = useState("2,5");
  const [type, setType] = useState<"simple" | "compound">("compound");
  const [months, setMonths] = useState("12");
  const [firstDue, setFirstDue] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [companyId, setCompanyId] = useState<string>("");
  const [description, setDescription] = useState("Parcelamento");
  const [movType, setMovType] = useState("Parcelamento");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const p = parseBRNumber(principal);
  const r = parseBRNumber(rate);
  const n = Math.max(1, Math.floor(Number(months) || 1));
  const pmt = calcPMT(p, r, n);

  const schedule = useMemo<Preview[]>(() => {
    const out: Preview[] = [];
    let balance = p;
    const rmo = r / 100;
    const base = new Date(firstDue + "T00:00:00");
    for (let i = 1; i <= n; i++) {
      const interest = type === "compound" ? balance * rmo : (p * rmo);
      const principalPart = pmt - interest;
      balance = Math.max(0, balance - principalPart);
      const d = new Date(base);
      d.setMonth(d.getMonth() + (i - 1));
      out.push({ n: i, due: d.toISOString().slice(0, 10), value: pmt, principalPart, interestPart: interest, balance });
    }
    return out;
  }, [p, r, n, pmt, firstDue, type]);

  const totInterest = schedule.reduce((s, x) => s + x.interestPart, 0);

  // Listagem de parcelamentos existentes agrupados
  const { data: groups = [] } = useQuery({
    queryKey: ["installment-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id,description,due_date,original_value,paid_value,status,installment_number,installment_total,company_id,source_system,companies(name)")
        .gt("installment_total", 1)
        .order("due_date", { ascending: false });
      if (error) throw error;
      type Row = { id: string; description: string | null; due_date: string | null; original_value: number; paid_value: number; status: string; installment_number: number; installment_total: number; company_id: string | null; source_system: string | null; companies: { name: string } | null };
      const map = new Map<string, { key: string; description: string; company: string; total: number; count: number; sum: number; paid: number; firstDue: string | null; source: string | null }>();
      for (const r of (data ?? []) as Row[]) {
        const baseDesc = (r.description ?? "").replace(/\s*\(\d+\/\d+\)\s*$/, "");
        const key = `${r.company_id ?? "-"}|${baseDesc}|${r.installment_total}`;
        const cur = map.get(key) ?? { key, description: baseDesc || "(sem descrição)", company: r.companies?.name ?? "—", total: r.installment_total, count: 0, sum: 0, paid: 0, firstDue: r.due_date, source: r.source_system };
        cur.count += 1;
        cur.sum += Number(r.original_value);
        cur.paid += Number(r.paid_value);
        if (r.due_date && (!cur.firstDue || r.due_date < cur.firstDue)) cur.firstDue = r.due_date;
        map.set(key, cur);
      }
      return Array.from(map.values()).slice(0, 20);
    },
  });

  const deleteGroup = useMutation({
    mutationFn: async (g: { description: string; total: number }) => {
      const { error } = await supabase
        .from("financial_transactions")
        .delete()
        .like("description", `${g.description}%`)
        .eq("installment_total", g.total);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Parcelamento removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const rows = schedule.map((row) => ({
        owner_id: user.id,
        company_id: companyId || null,
        movement_type: movType,
        description: `${description} (${row.n}/${n})`,
        original_value: row.value,
        installment_value: row.value,
        paid_value: 0,
        interest_rate_month: r,
        interest_type: type,
        due_date: row.due,
        installment_number: row.n,
        installment_total: n,
        status: "A vencer",
        source_system: "parcelamento",
      }));
      const { error } = await supabase.from("financial_transactions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${n} parcelas geradas`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Parcelamentos / PMT" description="Simule e gere parcelas automaticamente (Tabela Price)." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2"><Label>Cliente</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{companies.map((c: { id: string; name: string }) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Tipo de movimento</Label>
              <Select value={movType} onValueChange={setMovType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Parcelamento">Parcelamento</SelectItem>
                  <SelectItem value="Conta a Receber">Conta a Receber</SelectItem>
                  <SelectItem value="Conta a Pagar">Conta a Pagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="space-y-2"><Label>Valor principal (R$)</Label><Input value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
            <div className="space-y-2"><Label>Taxa mensal (%)</Label><Input value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Tipo de juros</Label>
              <Select value={type} onValueChange={(v) => setType(v as "simple" | "compound")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="simple">Simples</SelectItem><SelectItem value="compound">Composto (Price)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Nº de parcelas</Label><Input type="number" value={months} onChange={(e) => setMonths(e.target.value)} /></div>
            <div className="space-y-2"><Label>Primeira parcela</Label><Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></div>
            <div className="pt-2 border-t space-y-1 text-sm">
              <div className="flex justify-between"><span>Parcela (PMT):</span><span className="font-semibold">{formatBRL(pmt)}</span></div>
              <div className="flex justify-between"><span>Total a pagar:</span><span className="font-semibold">{formatBRL(pmt * n)}</span></div>
              <div className="flex justify-between"><span>Total de juros:</span><span className="font-semibold text-warning">{formatBRL(totInterest)}</span></div>
            </div>
            <Button className="w-full" onClick={() => generate.mutate()} disabled={!companyId || generate.isPending}>
              Gerar {n} parcelas
            </Button>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Prévia das parcelas</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Parcela</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Amortização</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.n}>
                      <TableCell>{row.n}</TableCell>
                      <TableCell>{formatDateBR(row.due)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(row.value)}</TableCell>
                      <TableCell className="text-right text-warning">{formatBRL(row.interestPart)}</TableCell>
                      <TableCell className="text-right">{formatBRL(row.principalPart)}</TableCell>
                      <TableCell className="text-right">{formatBRL(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Parcelamentos existentes</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>1º vencimento</TableHead>
                <TableHead className="text-right">Parcelas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum parcelamento cadastrado.</TableCell></TableRow>
                ) : groups.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="font-medium max-w-xs truncate">{g.description}</TableCell>
                    <TableCell>{g.company}</TableCell>
                    <TableCell>{formatDateBR(g.firstDue)}</TableCell>
                    <TableCell className="text-right">{g.count}/{g.total}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(g.sum)}</TableCell>
                    <TableCell className="text-right text-success">{formatBRL(g.paid)}</TableCell>
                    <TableCell><Badge variant="outline">{g.source ?? "manual"}</Badge></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" title="Remover parcelamento" onClick={() => { if (confirm(`Remover todas as ${g.count} parcelas de "${g.description}"?`)) deleteGroup.mutate({ description: g.description, total: g.total }); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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