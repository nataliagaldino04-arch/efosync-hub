import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Copy, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR, parseBRNumber } from "@/lib/br-format";
import { computeStatus, computeUpdated } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — EFO" }] }),
  component: LancamentosPage,
});

const MOV_TYPES = ["Receita", "Despesa", "Conta a Receber", "Conta a Pagar", "Parcelamento", "Juros", "Ajuste"];
const STATUSES = ["Pago", "Parcial", "Vencido", "A vencer", "Em aberto", "Cancelado"];
const PAYMENT_METHODS = ["Pix", "Cartão", "Dinheiro", "Boleto", "Transferência"];

interface Tx {
  id: string;
  company_id: string | null;
  movement_type: string;
  category: string | null;
  cost_center: string | null;
  description: string | null;
  original_value: number;
  installment_value: number;
  paid_value: number;
  interest_rate_month: number;
  interest_type: string;
  competence_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  installment_number: number | null;
  installment_total: number | null;
  payment_method: string | null;
  status: string;
  source_system: string;
  notes: string | null;
  companies?: { name: string } | null;
}

interface Company { id: string; name: string }
interface Category { id: string; name: string; type: string }

function LancamentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*, companies(name)")
        .order("due_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name,type").order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<Tx> & { id?: string }) => {
      // Recompute status automatically
      const updated = computeUpdated({
        principal: Number(input.original_value ?? 0),
        monthlyRatePct: Number(input.interest_rate_month ?? 0),
        type: (input.interest_type as "simple" | "compound") || "simple",
        dueDate: input.due_date ?? null,
        paymentDate: input.payment_date ?? null,
        paid: Number(input.paid_value ?? 0),
      });
      const status = input.status === "Cancelado" ? "Cancelado" : computeStatus({
        paid: updated.paid,
        updated: updated.updated,
        dueDate: input.due_date ?? null,
        paymentDate: input.payment_date ?? null,
      });
      const payload = { ...input, status };
      if (input.id) {
        const { error } = await supabase.from("financial_transactions").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_transactions").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      setOpen(false); setEditing(null);
      toast.success("Lançamento salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      toast.success("Removido");
    },
  });

  const filtered = useMemo(() => txs.filter((t) => {
    if (filterType !== "all" && t.movement_type !== filterType) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (search && !`${t.description ?? ""} ${t.companies?.name ?? ""} ${t.category ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [txs, filterType, filterStatus, search]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => fd.get(k) ? String(fd.get(k)) : null;
    const gn = (k: string) => parseBRNumber(String(fd.get(k) ?? "0"));
    const gi = (k: string) => { const v = fd.get(k); return v ? Number(v) : null; };
    const payload: Partial<Tx> = {
      company_id: g("company_id") || null,
      movement_type: String(fd.get("movement_type")),
      category: g("category"),
      cost_center: g("cost_center"),
      description: g("description"),
      original_value: gn("original_value"),
      installment_value: gn("installment_value"),
      paid_value: gn("paid_value"),
      interest_rate_month: gn("interest_rate_month"),
      interest_type: String(fd.get("interest_type") || "simple"),
      competence_date: g("competence_date"),
      due_date: g("due_date"),
      payment_date: g("payment_date"),
      installment_number: gi("installment_number"),
      installment_total: gi("installment_total"),
      payment_method: g("payment_method"),
      status: String(fd.get("status") || "Em aberto"),
      source_system: editing?.source_system || "manual",
      notes: g("notes"),
    };
    if (editing) (payload as any).id = editing.id;
    upsert.mutate(payload);
  }

  function markPaid(t: Tx) {
    const info = computeUpdated({
      principal: Number(t.original_value),
      monthlyRatePct: Number(t.interest_rate_month),
      type: (t.interest_type as "simple" | "compound") || "simple",
      dueDate: t.due_date,
      paymentDate: new Date().toISOString().slice(0, 10),
      paid: Number(t.paid_value),
    });
    upsert.mutate({
      id: t.id,
      original_value: Number(t.original_value),
      interest_rate_month: Number(t.interest_rate_month),
      interest_type: t.interest_type,
      due_date: t.due_date,
      payment_date: new Date().toISOString().slice(0, 10),
      paid_value: info.updated,
      status: "Pago",
    });
  }

  function duplicate(t: Tx) {
    const { id, companies, ...rest } = t;
    void id; void companies;
    upsert.mutate({ ...rest, paid_value: 0, payment_date: null, status: "Em aberto" } as any);
  }

  return (
    <>
      <PageHeader
        title="Lançamentos financeiros"
        description="Registre receitas, despesas, contas e parcelamentos. Status e juros são calculados automaticamente."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cliente / Empresa</Label>
                  <Select name="company_id" defaultValue={editing?.company_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de movimento *</Label>
                  <Select name="movement_type" defaultValue={editing?.movement_type ?? "Receita"} required>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MOV_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select name="category" defaultValue={editing?.category ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <F label="Centro de custo" name="cost_center" defaultValue={editing?.cost_center ?? ""} />
                <div className="sm:col-span-2"><F label="Descrição" name="description" defaultValue={editing?.description ?? ""} /></div>
                <F label="Valor original" name="original_value" defaultValue={String(editing?.original_value ?? 0)} />
                <F label="Valor da parcela / PMT" name="installment_value" defaultValue={String(editing?.installment_value ?? 0)} />
                <F label="Valor pago" name="paid_value" defaultValue={String(editing?.paid_value ?? 0)} />
                <F label="Taxa de juros (% ao mês)" name="interest_rate_month" defaultValue={String(editing?.interest_rate_month ?? 0)} />
                <div className="space-y-2">
                  <Label>Tipo de juros</Label>
                  <Select name="interest_type" defaultValue={editing?.interest_type ?? "simple"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simples</SelectItem>
                      <SelectItem value="compound">Composto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <F label="Data de competência" name="competence_date" type="date" defaultValue={editing?.competence_date ?? ""} />
                <F label="Data de vencimento" name="due_date" type="date" defaultValue={editing?.due_date ?? ""} />
                <F label="Data de pagamento" name="payment_date" type="date" defaultValue={editing?.payment_date ?? ""} />
                <F label="Parcela nº" name="installment_number" type="number" defaultValue={editing?.installment_number ? String(editing.installment_number) : ""} />
                <F label="Total de parcelas" name="installment_total" type="number" defaultValue={editing?.installment_total ? String(editing.installment_total) : ""} />
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select name="payment_method" defaultValue={editing?.payment_method ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editing?.status ?? "Em aberto"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Observações</Label>
                  <Textarea name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="submit" disabled={upsert.isPending}>Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-64">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {MOV_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado.</TableCell></TableRow>
                ) : filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDateBR(t.due_date)}</TableCell>
                    <TableCell>{t.companies?.name || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{t.movement_type}</Badge></TableCell>
                    <TableCell className="max-w-64 truncate">{t.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(Number(t.original_value))}</TableCell>
                    <TableCell className="text-right">{formatBRL(Number(t.paid_value))}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.status !== "Pago" && (
                          <Button size="icon" variant="ghost" title="Marcar como pago" onClick={() => markPaid(t)}>
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title="Duplicar" onClick={() => duplicate(t)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(t); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir" onClick={() => { if (confirm("Remover lançamento?")) del.mutate(t.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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

function F({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue?: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} type={type} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Pago": "bg-success text-success-foreground",
    "Parcial": "bg-warning text-warning-foreground",
    "Vencido": "bg-destructive text-destructive-foreground",
    "A vencer": "bg-info text-info-foreground",
    "Em aberto": "bg-muted text-muted-foreground",
    "Cancelado": "bg-secondary text-secondary-foreground",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}