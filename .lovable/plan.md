# Finalizar o modelo EFO: Balanço Gerencial, DRE por grupos e índices

O motor de importação flexível já está pronto e testado. Faltam três peças do modelo EFO: o Balanço Gerencial (Ativo/Passivo/Patrimônio), o DRE agrupado nos relatórios e os índices econômico-financeiros. É isso que esta rodada entrega.

## 1. Balanço Gerencial (novo módulo)

Nova tela **Balanço Gerencial**, com seleção de mês/ano e cliente/empresa:

- **Ativo**: Circulante (caixa e bancos, aplicações, contas a receber, estoques, adiantamentos, outros) e Não Circulante (imobilizado, intangível, investimentos, outros).
- **Passivo**: Circulante (fornecedores, empréstimos curto prazo, obrigações trabalhistas, obrigações tributárias, outros) e Não Circulante (empréstimos longo prazo, parcelamentos tributários, outros).
- **Patrimônio Líquido**: capital social, lucros/prejuízos acumulados, resultado do período.
- Totais e subtotais calculados na hora, com o aviso de conferência **Ativo = Passivo + Patrimônio** e a diferença destacada quando não fecha.
- Preenchimento **manual** (é o caminho principal) e sugestão automática a partir dos lançamentos do mês: saldo em contas a receber, contas a pagar em aberto e saldo de caixa entram pré-preenchidos, podendo ser sobrescritos.
- Cada mês fica salvo e pode ser reaberto e editado; o mês anterior é oferecido como base ao criar um novo.

## 2. DRE por grupos nos Relatórios

Os Relatórios ganham uma visão **DRE Gerencial** no formato do modelo EFO:

```text
Receita Bruta
(-) Impostos sobre vendas e receitas
= Receita Líquida
(-) Custo da Venda
= Lucro Bruto
(-) Despesas Comerciais
(-) Despesas Administrativas
(-) Despesas com Pessoal
(-) Despesas Tributárias
= Resultado Operacional
(-) Dívidas e Investimentos
= Resultado Líquido
```

- Cada linha usa o grupo do DRE gravado no lançamento, com percentual sobre a receita ao lado do valor.
- Coluna por mês (12 meses do ano escolhido) mais total do período.
- Lançamentos em "Não classificado" aparecem em uma linha própria, para não sumir do resultado.

## 3. Índices econômico-financeiros

Painel de índices, calculados a partir do DRE do mês e do Balanço do mesmo mês:

- Liquidez corrente, liquidez seca, liquidez imediata
- Endividamento geral e composição do endividamento
- Margem bruta, margem operacional e margem líquida
- Rentabilidade do patrimônio e do ativo
- Ponto de equilíbrio e prazo médio de recebimento

Cada índice mostra valor, uma leitura curta ("bom / atenção / crítico") e fica cinza quando faltar o Balanço do mês, indicando o que preencher.

## 4. Configurações: mapeamento categoria → grupo do DRE

Aba nova em Configurações para revisar o mapeamento memorizado: lista de categorias com o grupo do DRE e o tipo de custo (Fixo/Variável), editável e com opção de reaplicar aos lançamentos já existentes.

## 5. Entrada manual por tipo

Cada tipo de importação ganha um atalho "preencher manualmente", que abre o formulário do lançamento correspondente (a pagar, a receber, parcelamento) — e, no caso do balanço, leva direto à nova tela de Balanço Gerencial.

## 6. Validação

Build e lint limpos; um mês preenchido de ponta a ponta (importação → DRE → balanço → índices) conferindo que Ativo = Passivo + Patrimônio e que as margens batem com o DRE.

## Detalhes técnicos

- Migração: tabela `balance_sheets` (owner, company, mês, ano, e as linhas de ativo/passivo/PL em colunas numéricas com default 0), única por owner+company+mês+ano, RLS por proprietário e GRANTs; trigger de `updated_at`.
- `src/lib/dre.ts` (novo): ordem canônica dos grupos, montagem das linhas do DRE a partir das transações e cálculo dos índices a partir de DRE + balanço.
- `src/routes/_authenticated/balanco.tsx` (novo): formulário do balanço + sugestão a partir de `financial_transactions`.
- `src/routes/_authenticated/relatorios.tsx`: nova aba DRE Gerencial por grupo/mês, reusando `src/lib/dre.ts`.
- `src/routes/_authenticated/analise-efo.tsx`: painel de índices ligado ao balanço do mês.
- `src/routes/_authenticated/configuracoes.tsx`: CRUD de `dre_category_map`.
- `src/components/app-sidebar.tsx`: item "Balanço Gerencial".
