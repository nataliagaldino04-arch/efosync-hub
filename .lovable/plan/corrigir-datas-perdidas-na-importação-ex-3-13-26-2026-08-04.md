# Corrigir datas perdidas na importação (ex: "3/13/26")

## O que está acontecendo

Os erros `data_pagamento inválida: 3/13/26` não vêm da sua planilha: o valor original é 13/03/2026. Ao ler o arquivo, as células de data são convertidas em texto no formato americano (mês/dia/ano). Quando o dia é maior que 12 (13, 17, 18, 20, 25, 26), o sistema entende "mês 13" e rejeita a linha. As linhas com dia até 12 passaram — é por isso que "algumas vieram certas".

## Correção

1. **Leitura da planilha (Importação)**: manter as datas como data de verdade em vez de texto americano; quando vier como texto, usar o padrão brasileiro (dd/mm/aaaa). Isso resolve a causa na origem, para qualquer arquivo.

2. **Leitor de datas tolerante (rede de segurança)**: quando o valor tiver a forma `a/b/aa`:
   - primeiro número > 12 → dia/mês (padrão brasileiro);
   - primeiro ≤ 12 e segundo > 12 → mês/dia (americano) — cobre "3/13/26";
   - ambos ≤ 12 (ambíguo) → dia/mês (brasileiro), mantendo o comportamento atual.
   Datas inexistentes (ex: 31/02) continuam sendo rejeitadas.

3. **Aplicar nas duas portas de entrada**: a mesma regra vale para a importação pela tela e para a API de importação, que compartilham o mesmo interpretador.

4. **Validar com o seu arquivo**: reprocessar o "Contas a Pagar 4" e confirmar 0 erros de data, com as linhas aparecendo em Contas a Pagar, Relatórios (despesas) e Análise EFO.

## Detalhes técnicos

- `src/routes/_authenticated/importacao.tsx`: ajustar as opções de leitura do `XLSX` (`cellDates` + `dateNF` brasileiro em vez da conversão textual padrão de `raw: false`).
- `src/lib/br-format.ts` → `parseBRDate`: adicionar a desambiguação dia/mês descrita acima, sem alterar os caminhos ISO, serial do Excel e `dd/mmm`.
- Nenhuma mudança de banco de dados é necessária.