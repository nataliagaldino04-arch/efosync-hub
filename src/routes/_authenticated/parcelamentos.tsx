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
import { toast } from "sonner";
import { calcPMT } from "@/lib/finance";
import { formatBRL, formatDateBR, parseBRNumber } from "@/lib/br-format";
import { Badge } from "@/components/ui/badge";
import { Trash2, Eye, Download, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";
import { computeUpdated } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/parcelamentos")({
  head: () => ({ meta: [{ title: "Parcelamentos — EFO" }] }),
  component: ParcelamentosPage,
});

interface Preview {
  n: number;
  due: string;
  value: number;
  principalPart: number;
  interestPart: number;
  balance: number;
}

function ParcelamentosPage() {
  const qc = useQueryClient();
  const [principal, setPrincipal] = useState("1000,00");
  const [rate, setRate] = useState("2,5");
  const [type, setType] = useState<"simple" | "compound">("compound");
  const [months, setMonths] = useState("12");
  const [firstDue, setFirstDue] = useState(() =>
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
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
  const pmt = type === "simple" ? (p + p * (r / 100) * n) / n : calcPMT(p, r, n);

  const schedule = useMemo<Preview[]>(() => {
    const out: Preview[] = [];
    const rmo = r / 100;
    const base = new Date(firstDue + "T00:00:00");
    if (type === "compound") {
      let balance = p;
      for (let i = 1; i <= n; i++) {
        const interest = balance * rmo;
        const principalPart = pmt - interest;
        balance = Math.max(0, balance - principalPart);
        const d = new Date(base);
        d.setMonth(d.getMonth() + (i - 1));
        out.push({
          n: i,
          due: d.toISOString().slice(0, 10),
          value: pmt,
          principalPart,
          interestPart: interest,
          balance,
        });
      }
    } else {
      // Juros simples: total = principal + principal*taxa*n; parcela = total/n
      // Amortização linear: principalPart = p/n; interestPart = pmt - principalPart
      const principalPart = p / n;
      const interestPart = pmt - principalPart;
      let balance = p;
      for (let i = 1; i <= n; i++) {
        balance = Math.max(0, balance - principalPart);
        const d = new Date(base);
        d.setMonth(d.getMonth() + (i - 1));
        out.push({
          n: i,
          due: d.toISOString().slice(0, 10),
          value: pmt,
          principalPart,
          interestPart,
          balance,
        });
      }
    }
    return out;
  }, [p, r, n, pmt, firstDue, type]);

  const totInterest = schedule.reduce((s, x) => s + x.interestPart, 0);

  // Listagem de parcelamentos existentes agrupados
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const { data: allInstallments = [] } = useQuery({
    queryKey: ["installment-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "id,description,due_date,original_value,paid_value,status,installment_number,installment_total,company_id,source_system,interest_rate_month,interest_type,payment_date,installment_group_id,companies(name)",
        )
        .gt("installment_total", 1)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InstallmentRow[];
    },
  });

  const { groups, byKey } = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        description: string;
        company: string;
        total: number;
        count: number;
        sum: number;
        paid: number;
        firstDue: string | null;
        source: string | null;
        company_id: string | null;
        ids: string[];
      }
    >();
    const byK = new Map<string, InstallmentRow[]>();
    for (const r of allInstallments) {
      const baseDesc = (r.description ?? "").replace(/\s*\(\d+\/\d+\)\s*$/, "");
      // Prioriza installment_group_id (contratos gerados após a migração).
      // Fallback inclui source_system + primeira data para reduzir colisões em dados legados.
      const key = r.installment_group_id
        ? `g:${r.installment_group_id}`
        : `${r.company_id ?? "-"}|${r.source_system ?? "-"}|${baseDesc}|${r.installment_total}|${r.due_date ?? ""}`;
      const cur = map.get(key) ?? {
        key,
        description: baseDesc || "(sem descrição)",
        company: r.companies?.name ?? "—",
        total: r.installment_total,
        count: 0,
        sum: 0,
        paid: 0,
        firstDue: r.due_date,
        source: r.source_system,
        company_id: r.company_id,
        ids: [],
      };
      cur.count += 1;
      cur.sum += Number(r.original_value);
      cur.paid += Number(r.paid_value);
      cur.ids.push(r.id);
      if (r.due_date && (!cur.firstDue || r.due_date < cur.firstDue)) cur.firstDue = r.due_date;
      map.set(key, cur);
      const list = byK.get(key) ?? [];
      list.push(r);
      byK.set(key, list);
    }
    return { groups: Array.from(map.values()).slice(0, 50), byKey: byK };
  }, [allInstallments]);

  const deleteGroup = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("financial_transactions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Parcelamento removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payInstallment = useMutation({
    mutationFn: async (v: { id: string; paid: number; full: boolean }) => {
      const payload = v.full
        ? { paid_value: v.paid, payment_date: new Date().toISOString().slice(0, 10) }
        : { paid_value: v.paid };
      const { error } = await supabase
        .from("financial_transactions")
        .update(payload)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Parcela atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalcGroup = useMutation({
    mutationFn: async (rows: InstallmentRow[]) => {
      // Trigger compute_tx_status re-executa em UPDATE; reescrevemos paid_value com ele mesmo para forçar recomputo.
      for (const r of rows) {
        await supabase
          .from("financial_transactions")
          .update({ paid_value: r.paid_value })
          .eq("id", r.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Juros recalculados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportGroup(
    g: { description: string; company: string; ids: string[] },
    rows: InstallmentRow[],
  ) {
    const data = rows.map((r) => {
      const info = computeUpdated({
        principal: Number(r.original_value),
        monthlyRatePct: Number(r.interest_rate_month ?? 0),
        type: (r.interest_type as "simple" | "compound") || "simple",
        dueDate: r.due_date,
        paymentDate: r.payment_date ?? null,
        paid: Number(r.paid_value),
      });
      return {
        parcela: `${r.installment_number}/${r.installment_total}`,
        vencimento: r.due_date,
        valor: r.original_value,
        pago: r.paid_value,
        juros: Number(info.interest.toFixed(2)),
        atualizado: Number(info.updated.toFixed(2)),
        em_aberto: Number(info.open.toFixed(2)),
        status: r.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parcelamento");
    XLSX.writeFile(wb, `parcelamento_${g.company}_${g.description}.xlsx`.replace(/[^\w.-]+/g, "_"));
  }

  const generate = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const groupId = crypto.randomUUID();
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
        installment_group_id: groupId,
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
      <PageHeader
        title="Parcelamentos / PMT"
        description="Simule e gere parcelas automaticamente (Tabela Price)."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de movimento</Label>
              <Select value={movType} onValueChange={setMovType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Parcelamento">Parcelamento</SelectItem>
                  <SelectItem value="Conta a Receber">Conta a Receber</SelectItem>
                  <SelectItem value="Conta a Pagar">Conta a Pagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor principal (R$)</Label>
              <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Taxa mensal (%)</Label>
              <Input value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de juros</Label>
              <Select value={type} onValueChange={(v) => setType(v as "simple" | "compound")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simples</SelectItem>
                  <SelectItem value="compound">Composto (Price)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nº de parcelas</Label>
              <Input type="number" value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Primeira parcela</Label>
              <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </div>
            <div className="pt-2 border-t space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Parcela (PMT):</span>
                <span className="font-semibold">{formatBRL(pmt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total a pagar:</span>
                <span className="font-semibold">{formatBRL(pmt * n)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total de juros:</span>
                <span className="font-semibold text-warning">{formatBRL(totInterest)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => generate.mutate()}
              disabled={!companyId || generate.isPending}
            >
              Gerar {n} parcelas
            </Button>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Prévia das parcelas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Parcela</TableHead>
                    <TableHead className="text-right">Juros</TableHead>
                    <TableHead className="text-right">Amortização</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.n}>
                      <TableCell>{row.n}</TableCell>
                      <TableCell>{formatDateBR(row.due)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBRL(row.value)}
                      </TableCell>
                      <TableCell className="text-right text-warning">
                        {formatBRL(row.interestPart)}
                      </TableCell>
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
        <CardHeader>
          <CardTitle>Parcelamentos existentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>1º vencimento</TableHead>
                  <TableHead className="text-right">Parcelas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      Nenhum parcelamento cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {g.description}
                      </TableCell>
                      <TableCell>{g.company}</TableCell>
                      <TableCell>{formatDateBR(g.firstDue)}</TableCell>
                      <TableCell className="text-right">
                        {g.count}/{g.total}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(g.sum)}</TableCell>
                      <TableCell className="text-right text-success">{formatBRL(g.paid)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{g.source ?? "manual"}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Detalhes"
                          onClick={() => setDetailKey(g.key)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar"
                          onClick={() => exportGroup(g, byKey.get(g.key) ?? [])}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Recalcular juros"
                          onClick={() => recalcGroup.mutate(byKey.get(g.key) ?? [])}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remover parcelamento"
                          onClick={() => {
                            if (
                              confirm(`Remover todas as ${g.count} parcelas de "${g.description}"?`)
                            )
                              deleteGroup.mutate(g.ids);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailKey} onOpenChange={(o) => !o && setDetailKey(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do parcelamento</DialogTitle>
          </DialogHeader>
          {detailKey && (
            <div className="overflow-x-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byKey.get(detailKey) ?? [])
                    .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.installment_number}/{r.installment_total}
                        </TableCell>
                        <TableCell>{formatDateBR(r.due_date)}</TableCell>
                        <TableCell className="text-right">
                          {formatBRL(Number(r.original_value))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBRL(Number(r.paid_value))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const info = computeUpdated({
                                principal: Number(r.original_value),
                                monthlyRatePct: Number(r.interest_rate_month ?? 0),
                                type: (r.interest_type as "simple" | "compound") || "simple",
                                dueDate: r.due_date,
                                paymentDate: null,
                                paid: 0,
                              });
                              payInstallment.mutate({
                                id: r.id,
                                paid: Number(info.updated.toFixed(2)),
                                full: true,
                              });
                            }}
                          >
                            Pagar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const v = prompt(
                                "Valor pago parcial (R$):",
                                String(r.paid_value ?? 0),
                              );
                              if (v == null) return;
                              const val = parseBRNumber(v);
                              if (val < 0) return toast.error("Valor inválido");
                              payInstallment.mutate({ id: r.id, paid: val, full: false });
                            }}
                          >
                            Parcial
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailKey(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface InstallmentRow {
  id: string;
  description: string | null;
  due_date: string | null;
  original_value: number;
  paid_value: number;
  status: string;
  installment_number: number;
  installment_total: number;
  company_id: string | null;
  source_system: string | null;
  interest_rate_month: number | null;
  interest_type: string | null;
  payment_date: string | null;
  installment_group_id: string | null;
  companies: { name: string } | null;
}
