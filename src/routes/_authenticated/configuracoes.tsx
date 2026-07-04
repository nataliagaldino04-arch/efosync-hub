import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — EFO" }] }),
  component: ConfigPage,
});

const CAT_TYPES = [
  { value: "revenue", label: "Receita" },
  { value: "fixed_expense", label: "Despesa Fixa" },
  { value: "variable_expense", label: "Despesa Variável" },
];

function ConfigPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("revenue");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("type").order("name")).data ?? [],
  });

  const { data: counts } = useQuery({
    queryKey: ["config-counts"],
    queryFn: async () => {
      const [c, t, p] = await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase.from("financial_transactions").select("*", { count: "exact", head: true }),
        supabase.from("action_plans_5w2h").select("*", { count: "exact", head: true }),
      ]);
      return { companies: c.count ?? 0, transactions: t.count ?? 0, plans: p.count ?? 0 };
    },
  });

  const addCat = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Nome obrigatório");
      const { error } = await supabase.from("categories").insert({ name: newName.trim(), type: newType } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); setNewName(""); toast.success("Categoria criada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCat = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Removida"); },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <PageHeader title="Configurações" description="Sua conta, categorias e uso do sistema." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Conta</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs text-muted-foreground">E-mail</Label><div className="font-medium">{user?.email ?? "—"}</div></div>
            <div><Label className="text-xs text-muted-foreground">Membro desde</Label><div>{user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—"}</div></div>
            <Button variant="outline" onClick={signOut} className="w-full"><LogOut className="h-4 w-4 mr-2" />Sair</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Uso do sistema</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Clientes cadastrados" value={counts?.companies ?? 0} />
            <Row label="Lançamentos financeiros" value={counts?.transactions ?? 0} />
            <Row label="Ações no plano 5W2H" value={counts?.plans ?? 0} />
            <Row label="Categorias" value={categories.length} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nova categoria</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex.: Marketing" /></div>
            <div className="space-y-2"><Label>Tipo</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => addCat.mutate()} className="w-full" disabled={addCat.isPending}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Categorias</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
            <TableBody>
              {(categories as { id: string; name: string; type: string }[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><Badge variant="outline">{CAT_TYPES.find((t) => t.value === c.type)?.label ?? c.type}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover categoria?")) delCat.mutate(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between border-b pb-2 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}