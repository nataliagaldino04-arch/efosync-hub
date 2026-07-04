import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR, parseBRNumber } from "@/lib/br-format";

export const Route = createFileRoute("/_authenticated/plano-acao")({
  head: () => ({ meta: [{ title: "Plano de Ação 5W2H — EFO" }] }),
  component: PlanoAcaoPage,
});

const STATUSES = ["Pendente", "Em andamento", "Concluído", "Atrasado", "Cancelado"];
const PRIORITIES = ["Baixa", "Normal", "Alta", "Urgente"];

interface Plan {
  id: string;
  company_id: string | null;
  what: string | null;
  why: string | null;
  who: string | null;
  where_field: string | null;
  how: string | null;
  how_much: number | null;
  when_date: string | null;
  status: string;
  priority: string;
  days_remaining: number | null;
}

function PlanoAcaoPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["action-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans_5w2h")
        .select("*, companies(name)")
        .order("when_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () =>
      (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<Plan> & { id?: string }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("action_plans_5w2h").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("action_plans_5w2h").insert(input as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-plans"] });
      setOpen(false);
      setEditing(null);
      toast.success("Ação salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("action_plans_5w2h").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-plans"] });
      toast.success("Removido");
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => {
      const v = fd.get(k);
      return v ? String(v) : null;
    };
    const payload: Partial<Plan> = {
      company_id: g("company_id"),
      what: g("what"),
      why: g("why"),
      who: g("who"),
      where_field: g("where_field"),
      how: g("how"),
      how_much: fd.get("how_much") ? parseBRNumber(String(fd.get("how_much"))) : null,
      when_date: g("when_date"),
      status: String(fd.get("status") || "Pendente"),
      priority: String(fd.get("priority") || "Normal"),
    };
    if (editing) payload.id = editing.id;
    upsert.mutate(payload);
  }

  return (
    <>
      <PageHeader
        title="Plano de Ação 5W2H"
        description="What, Why, Who, Where, When, How, How much — organize e execute."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova ação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar ação" : "Nova ação 5W2H"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>O que fazer (What) *</Label>
                  <Textarea name="what" required defaultValue={editing?.what ?? ""} rows={2} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Por quê (Why)</Label>
                  <Textarea name="why" defaultValue={editing?.why ?? ""} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Quem (Who)</Label>
                  <Input name="who" defaultValue={editing?.who ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Onde (Where)</Label>
                  <Input name="where_field" defaultValue={editing?.where_field ?? ""} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Como (How)</Label>
                  <Textarea name="how" defaultValue={editing?.how ?? ""} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Quanto custa (How much)</Label>
                  <Input
                    name="how_much"
                    defaultValue={editing?.how_much ? String(editing.how_much) : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quando (When)</Label>
                  <Input name="when_date" type="date" defaultValue={editing?.when_date ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select name="company_id" defaultValue={editing?.company_id ?? undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {(companies as { id: string; name: string }[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select name="priority" defaultValue={editing?.priority ?? "Normal"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editing?.status ?? "Pendente"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="submit" disabled={upsert.isPending}>
                    Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>O quê</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead className="text-right">Quanto</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma ação cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                (plans as (Plan & { companies?: { name: string } | null })[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-xs">
                      <div className="font-medium truncate">{p.what}</div>
                      {p.companies?.name && (
                        <div className="text-xs text-muted-foreground">{p.companies.name}</div>
                      )}
                    </TableCell>
                    <TableCell>{p.who ?? "—"}</TableCell>
                    <TableCell>{formatDateBR(p.when_date)}</TableCell>
                    <TableCell
                      className={`text-right text-sm ${p.days_remaining != null && p.days_remaining < 0 ? "text-destructive font-semibold" : ""}`}
                    >
                      {p.days_remaining == null ? "—" : `${p.days_remaining}d`}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.how_much ? formatBRL(p.how_much) : "—"}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge p={p.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge s={p.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.status !== "Concluído" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Concluir"
                            onClick={() => upsert.mutate({ id: p.id, status: "Concluído" })}
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => {
                            setEditing(p);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir"
                          onClick={() => {
                            if (confirm("Remover?")) del.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    Concluído: "bg-success text-success-foreground",
    "Em andamento": "bg-info text-info-foreground",
    Pendente: "bg-warning text-warning-foreground",
    Atrasado: "bg-destructive text-destructive-foreground",
    Cancelado: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map[s] ?? "bg-muted"}`}
    >
      {s}
    </span>
  );
}
function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    Urgente: "destructive",
    Alta: "default",
    Normal: "secondary",
    Baixa: "outline",
  };
  return <Badge variant={map[p] as "default" | "destructive" | "secondary" | "outline"}>{p}</Badge>;
}
