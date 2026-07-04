import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { CheckCircle2, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/br-format";
import { computeUpdated } from "@/lib/finance";

interface Tx {
  id: string;
  company_id: string | null;
  movement_type: string;
  description: string | null;
  original_value: number;
  paid_value: number;
  interest_rate_month: number;
  interest_type: string;
  due_date: string | null;
  payment_date: string | null;
  status: string;
  companies?: { name: string } | null;
}

export function TxList({ types, kind }: { types: string[]; kind: "receber" | "pagar" }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["tx-filter", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "id,company_id,movement_type,description,original_value,paid_value,interest_rate_month,interest_type,due_date,payment_date,status,companies(name)",
        )
        .in("movement_type", types)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  const enriched = useMemo(
    () =>
      txs.map((t) => {
        const info = computeUpdated({
          principal: Number(t.original_value),
          monthlyRatePct: Number(t.interest_rate_month),
          type: (t.interest_type as "simple" | "compound") || "simple",
          dueDate: t.due_date,
          paymentDate: t.payment_date,
          paid: Number(t.paid_value),
        });
        return { ...t, ...info };
      }),
    [txs],
  );

  const filtered = enriched.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (
      search &&
      !`${t.description ?? ""} ${t.companies?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const totOriginal = filtered.reduce((s, t) => s + t.principal, 0);
  const totUpdated = filtered.reduce((s, t) => s + t.updated, 0);
  const totOpen = filtered.reduce((s, t) => s + t.open, 0);
  const totInterest = filtered.reduce((s, t) => s + t.interest, 0);

  const markPaid = useMutation({
    mutationFn: async (t: Tx & { updated: number }) => {
      const { error } = await supabase
        .from("financial_transactions")
        .update({
          payment_date: new Date().toISOString().slice(0, 10),
          paid_value: t.updated,
          status: "Pago",
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Marcado como pago");
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total original" value={formatBRL(totOriginal)} />
        <StatCard label="Valor atualizado" value={formatBRL(totUpdated)} accent="info" />
        <StatCard
          label={kind === "receber" ? "Juros a receber" : "Juros a pagar"}
          value={formatBRL(totInterest)}
          accent="warning"
        />
        <StatCard
          label="Em aberto"
          value={formatBRL(totOpen)}
          accent={kind === "receber" ? "success" : "destructive"}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2 flex-1 min-w-64">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="Em aberto">Em aberto</SelectItem>
                <SelectItem value="A vencer">A vencer</SelectItem>
                <SelectItem value="Vencido">Vencido</SelectItem>
                <SelectItem value="Parcial">Parcial</SelectItem>
                <SelectItem value="Pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Cliente / Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Atualizado</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDateBR(t.due_date)}</TableCell>
                      <TableCell>{t.companies?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate">{t.description ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(t.principal)}</TableCell>
                      <TableCell className="text-right text-warning">
                        {formatBRL(t.interest)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBRL(t.updated)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(t.open)}</TableCell>
                      <TableCell>
                        {t.days > 0 ? <Badge variant="destructive">{t.days}d</Badge> : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell>
                        {t.status !== "Pago" && t.status !== "Cancelado" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Marcar como pago"
                            onClick={() => markPaid.mutate(t)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "destructive" | "warning" | "info";
}) {
  const color =
    accent === "success"
      ? "text-success"
      : accent === "destructive"
        ? "text-destructive"
        : accent === "warning"
          ? "text-warning"
          : accent === "info"
            ? "text-info"
            : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <TrendingUp className="h-3 w-3" />
          {label}
        </div>
        <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pago: "bg-success text-success-foreground",
    Parcial: "bg-warning text-warning-foreground",
    Vencido: "bg-destructive text-destructive-foreground",
    "A vencer": "bg-info text-info-foreground",
    "Em aberto": "bg-muted text-muted-foreground",
    Cancelado: "bg-secondary text-secondary-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}
