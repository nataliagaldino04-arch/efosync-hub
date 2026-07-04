import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers,
  Calculator,
  FileUp,
  FileDown,
  BarChart3,
  FileText,
  ListChecks,
  Settings,
  LineChart,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes / Empresas", url: "/clientes", icon: Building2 },
  { title: "Lançamentos", url: "/lancamentos", icon: Receipt },
  { title: "Contas a Receber", url: "/contas-receber", icon: ArrowDownToLine },
  { title: "Contas a Pagar", url: "/contas-pagar", icon: ArrowUpFromLine },
  { title: "Parcelamentos / PMT", url: "/parcelamentos", icon: Layers },
  { title: "Simulador de Juros", url: "/simulador", icon: Calculator },
  { title: "Importação", url: "/importacao", icon: FileUp },
  { title: "Exportação", url: "/exportacao", icon: FileDown },
  { title: "Análise EFO", url: "/analise-efo", icon: BarChart3 },
  { title: "Relatórios", url: "/relatorios", icon: FileText },
  { title: "Plano de Ação 5W2H", url: "/plano-acao", icon: ListChecks },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center shrink-0">
            <LineChart className="h-4 w-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold tracking-tight">EFO</div>
            <div className="text-[10px] opacity-70 truncate">Análise Financeira</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}