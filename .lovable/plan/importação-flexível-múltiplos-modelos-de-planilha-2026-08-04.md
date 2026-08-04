# Importação flexível: múltiplos modelos de planilha

Objetivo: qualquer planilha "de mercado" (como a Contas a Pagar 4) passa a ser importável, sem depender do modelo EFO de 21 colunas. Nenhum dado é importado automaticamente — o motor de leitura é que fica pronto.

## 1. Perfis de importação

A tela de importação passa a começar pela escolha do **tipo de dado**:

- Contas a Pagar
- Contas a Receber
- Parcelamentos / Financiamentos
- Balanço Gerencial (Ativo / Passivo / Patrimônio)
- Padrão EFO (o modelo atual de 21 colunas)

Para cada tipo existem **perfis de layout** reconhecidos automaticamente. O primeiro perfil novo é o do arquivo que você enviou (Competência, Vencimento, CPF/CNPJ Fornecedor, Valor, Forma de Pgto, Tipo, Classificação, Descrição, Categoria, Pagamento, Clínica, Observações, Valor Total). Ao subir o arquivo o sistema:

1. localiza a linha de cabeçalho mesmo com linhas em branco ou títulos acima;
2. compara os cabeçalhos com os perfis conhecidos e escolhe o mais parecido;
3. mostra "Modelo detectado: Contas a Pagar", com opção de trocar o perfil ou usar o mapeamento manual coluna-a-coluna que já existe hoje.

Acrescentar novos modelos no futuro passa a ser apenas adicionar uma entrada nessa lista.

## 2. Regras de leitura do modelo Contas a Pagar

- `Descrição` vira o nome do fornecedor/cliente, com cadastro criado automaticamente quando não existir; `CPF/CNPJ Fornecedor` alimenta o documento quando preenchido.
- `Vencimento` aceita `16/03/26` (ano de 2 dígitos), `12/06/2026`, `12/jun` e datas nativas do Excel.
- `Competência` aceita `FEV/2026`, `DEZ/2025`, `-` e vazio (nesse caso usa o mês do vencimento).
- `Valor` aceita `154.9`, `48,07` e `R$ 1.234,56` — inclusive misturados na mesma coluna.
- `Pagamento` preenchido (data ou data/hora) marca o lançamento como pago, com data e valor pago; vazio deixa em aberto, e vencido/a vencer continua sendo calculado automaticamente.
- `Forma de Pgto`, `Observações`, `Clínica` e `Classificação` são preservadas (forma de pagamento, observações e centro de custo).
- O tipo de movimento é fixado como despesa, então tudo aparece em **Contas a Pagar**, nos **Relatórios** como despesa e na **Análise EFO** como despesa.

## 3. Classificação Fixo/Variável e grupos do DRE

- A coluna `Tipo` (`Custo Fixo` / `Custo Variável`) passa a ser gravada no lançamento, e a Análise EFO usa esse campo em vez da lista fixa de categorias — despesas fixas e variáveis passam a separar corretamente.
- Cada categoria da planilha (SALÁRIO, IPTU, MATERIAIS ODONTOLÓGICOS, LABORATÓRIO/PROTÉTICO, DESPESA RH...) é ligada a um **grupo do DRE** do modelo EFO: Custo da Venda, Impostos, Despesas Comerciais, Despesas Administrativas, Despesas com Pessoal, Despesas Tributárias, Dívidas e Investimentos.
- Esse mapeamento aparece em uma etapa da importação, já pré-sugerido por palavras-chave, editável, e fica **memorizado** — na próxima importação as mesmas categorias já vêm resolvidas.
- Categoria sem grupo não bloqueia a importação: entra como "Não classificado" e pode ser ajustada depois em Configurações.

## 4. Preenchimento manual

- Na prévia, linhas com pendências (sem fornecedor, sem categoria, sem grupo) podem ser corrigidas ali mesmo, célula por célula, antes de gravar.
- Cada tipo de importação também ganha um botão "preencher manualmente", que abre o formulário correspondente em vez de exigir planilha — inclusive para Ativo / Passivo / Patrimônio.

## 5. Validação

Depois de implementar: build e lint limpos, e teste de leitura do arquivo Contas a Pagar 4 até a prévia (sem gravar), conferindo datas `16/03/26`, valores com vírgula e ponto, pagos vs. em aberto e a separação fixo/variável.

## Detalhes técnicos

- `src/lib/import-profiles.ts` (novo): registro de perfis `{ id, tipo, matchHeaders, columnMap, transforms, defaults }`, detector por similaridade de cabeçalho e localizador da linha de cabeçalho.
- `src/lib/br-format.ts`: aceitar ano de 2 dígitos, competência `MMM/AAAA` e timestamps `AAAA-MM-DD HH:MM:SS`.
- `src/lib/efo-schema.ts`: `normalizeEfoRow` ganha overrides de perfil (tipo de movimento fixo, status derivado da data de pagamento) sem alterar o comportamento do padrão EFO atual.
- `src/routes/_authenticated/importacao.tsx`: etapa de tipo/perfil, etapa de mapeamento categoria → grupo do DRE, prévia editável.
- `src/routes/api/public/efo/import/financial-transactions.ts`: aceita `profile` no corpo e reusa o mesmo motor.
- Banco (migração): colunas `cost_type` (fixo/variável) e `dre_group` em `financial_transactions`; tabela `dre_category_map` (proprietário, categoria, grupo, tipo de custo) com RLS por proprietário e GRANTs.
- Análise EFO e Relatórios passam a agrupar por `cost_type`/`dre_group` quando presentes, com fallback para a lógica atual.