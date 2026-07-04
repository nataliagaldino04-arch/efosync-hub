import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function ComingSoon({
  title,
  description,
  features,
}: {
  title: string;
  description: string;
  features?: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center mb-4">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Módulo em construção</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Este módulo faz parte da próxima fase de entrega. As telas fundamentais (Dashboard,
            Clientes, Lançamentos e Simulador de Juros) já estão prontas para uso.
          </p>
          {features && features.length > 0 && (
            <ul className="mt-6 space-y-2 text-sm text-left max-w-md mx-auto">
              {features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-primary">•</span> {f}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
