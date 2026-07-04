import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — EFO" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const { data: categories = [] } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("type").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = {
    revenue: categories.filter((c) => c.type === "revenue"),
    fixed_expense: categories.filter((c) => c.type === "fixed_expense"),
    variable_expense: categories.filter((c) => c.type === "variable_expense"),
  };

  return (
    <>
      <PageHeader title="Configurações" description="Categorias e preferências do sistema." />
      <div className="grid gap-6 md:grid-cols-3">
        <CategoryCard title="Receitas" items={groups.revenue.map((c) => c.name)} />
        <CategoryCard title="Despesas fixas" items={groups.fixed_expense.map((c) => c.name)} />
        <CategoryCard title="Despesas variáveis" items={groups.variable_expense.map((c) => c.name)} />
      </div>
    </>
  );
}

function CategoryCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.length === 0 ? <span className="text-sm text-muted-foreground">Nenhuma categoria.</span> :
          items.map((n) => <Badge key={n} variant="secondary">{n}</Badge>)}
      </CardContent>
    </Card>
  );
}