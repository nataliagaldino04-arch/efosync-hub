import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { DRE_GROUPS, COST_TYPES, suggestDreGroup } from "@/lib/import-profiles";

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
  const [mapCategory, setMapCategory] = useState("");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await supabase.from("categories").select("*").order("type").order("name")).data ?? [],
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
      const { error } = await supabase
        .from("categories")
        .insert({ name: newName.trim(), type: newType } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setNewName("");
      toast.success("Categoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Removida");
    },
  });

  const { data: dreMap = [] } = useQuery({
    queryKey: ["dre-map"],
    queryFn: async () =>
      (await supabase.from("dre_category_map").select("*").order("category")).data ?? [],
  });

  const saveMap = useMutation({
    mutationFn: async (input: { id?: string; category: string; group: string; cost?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      if (!input.category.trim()) throw new Error("Categoria obrigatória");
      if (input.id) {
        const { error } = await supabase
          .from("dre_category_map")
          .update({ dre_group: input.group, cost_type: input.cost ?? null } as never)
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dre_category_map").insert({
          owner_id: user.id,
          category: input.category.trim(),
          dre_group: input.group,
          cost_type: input.cost ?? null,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-map"] });
      setMapCategory("");
      toast.success("Mapeamento salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMap = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_category_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dre-map"] });
      toast.success("Mapeamento removido");
    },
  });

  const reapply = useMutation({
    mutationFn: async () => {
      let touched = 0;
      for (const m of dreMap as {
        category: string;
        dre_group: string;
        cost_type: string | null;
      }[]) {
        const patch: Record<string, string> = { dre_group: m.dre_group };
        if (m.cost_type) patch.cost_type = m.cost_type;
        const { data, error } = await supabase
          .from("financial_transactions")
          .update(patch as never)
          .eq("category", m.category)
          .select("id");
        if (error) throw error;
        touched += data?.length ?? 0;
      }
      return touched;
    },
    onSuccess: (n) => {
      qc.invalidateQueries();
      toast.success(`${n} lançamento(s) reclassificado(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
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
          <CardHeader>
            <CardTitle>Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <div className="font-medium">{user?.email ?? "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Membro desde</Label>
              <div>
                {user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—"}
              </div>
            </div>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uso do sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Clientes cadastrados" value={counts?.companies ?? 0} />
            <Row label="Lançamentos financeiros" value={counts?.transactions ?? 0} />
            <Row label="Ações no plano 5W2H" value={counts?.plans ?? 0} />
            <Row label="Categorias" value={categories.length} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nova categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex.: Marketing"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addCat.mutate()} className="w-full" disabled={addCat.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categories as { id: string; name: string; type: string }[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CAT_TYPES.find((t) => t.value === c.type)?.label ?? c.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remover categoria?")) delCat.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Categoria → grupo do DRE</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Define em qual linha do DRE cada categoria entra e se o custo é fixo ou variável.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => reapply.mutate()}
            disabled={reapply.isPending || dreMap.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reaplicar aos lançamentos
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2 min-w-52">
              <Label>Nova categoria</Label>
              <Input
                value={mapCategory}
                onChange={(e) => setMapCategory(e.target.value)}
                placeholder="ex.: MATERIAIS ODONTOLÓGICOS"
              />
            </div>
            <Button
              onClick={() =>
                saveMap.mutate({
                  category: mapCategory,
                  group: suggestDreGroup(mapCategory),
                })
              }
              disabled={saveMap.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Grupo do DRE</TableHead>
                <TableHead>Tipo de custo</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                dreMap as {
                  id: string;
                  category: string;
                  dre_group: string;
                  cost_type: string | null;
                }[]
              ).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.category}</TableCell>
                  <TableCell>
                    <Select
                      value={m.dre_group}
                      onValueChange={(v) =>
                        saveMap.mutate({
                          id: m.id,
                          category: m.category,
                          group: v,
                          cost: m.cost_type ?? undefined,
                        })
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DRE_GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.cost_type ?? "__none__"}
                      onValueChange={(v) =>
                        saveMap.mutate({
                          id: m.id,
                          category: m.category,
                          group: m.dre_group,
                          cost: v === "__none__" ? undefined : v,
                        })
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não definido</SelectItem>
                        {COST_TYPES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => delMap.mutate(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {dreMap.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhuma categoria mapeada ainda — o mapeamento é criado na importação ou aqui.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b pb-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
