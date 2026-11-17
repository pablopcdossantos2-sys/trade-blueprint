# Integração com diário de trades

## Objetivo

A integração foi projetada para não depender de um software específico. O Trade Blueprint consegue importar execuções em **JSON** ou **CSV**, armazená-las localmente e vinculá-las aos planos existentes.

O vínculo pode acontecer:

1. automaticamente, quando existe exatamente um plano com a mesma **data + ativo**;
2. manualmente, escolhendo o plano na tabela de execuções importadas.

Depois do vínculo, cada trade também pode ser associado ao cenário **A, B ou C**.

## Campos mínimos

Para que uma linha seja importada, são obrigatórios:

- data;
- ativo.

O importador reconhece aliases comuns em português e inglês.

### Data

Aceita cabeçalhos como:

- `tradingDate`
- `tradeDate`
- `date`
- `data`
- `dataPregao`

Formatos de data recomendados:

- `2026-10-15`
- `15/10/2026`

### Ativo

Aceita:

- `asset`
- `ativo`
- `symbol`
- `ticker`

## Campos opcionais reconhecidos

| Informação | Exemplos de cabeçalhos |
|---|---|
| ID externo | `externalId`, `tradeId`, `id`, `codigo`, `ticket` |
| Direção | `side`, `direction`, `lado`, `direcao`, `tipo` |
| Hora de entrada | `entryTime`, `horaEntrada`, `entradaHora`, `openTime` |
| Hora de saída | `exitTime`, `horaSaida`, `saidaHora`, `closeTime` |
| Preço de entrada | `entryPrice`, `precoEntrada`, `openPrice` |
| Preço de saída | `exitPrice`, `precoSaida`, `closePrice` |
| Quantidade | `quantity`, `qty`, `quantidade`, `contratos` |
| Resultado | `result`, `resultado`, `pnl`, `profit`, `lucro` |
| Observações | `notes`, `nota`, `observacao`, `observacoes`, `comment` |
| Cenário | `scenario`, `cenario`, `scenarioLabel` |
| ID do plano | `planId`, `planoId` |

Os nomes são normalizados para comparação, então diferenças simples de maiúsculas/minúsculas, espaços e acentos não impedem o reconhecimento.

## Exemplo CSV

```csv
data,ativo,lado,horaEntrada,horaSaida,precoEntrada,precoSaida,quantidade,resultado,cenario
2026-10-15,WINFUT,Compra,09:18,09:31,145000,145180,2,+360,A
2026-10-15,WINFUT,Venda,10:04,10:12,145120,145210,1,-90,B
```

Também é aceito CSV separado por ponto e vírgula.

## Exemplo JSON

Pode ser um array diretamente:

```json
[
  {
    "date": "2026-10-15",
    "asset": "WINFUT",
    "side": "Compra",
    "entryTime": "09:18",
    "exitTime": "09:31",
    "entryPrice": "145000",
    "exitPrice": "145180",
    "quantity": "2",
    "result": "+360",
    "scenario": "A"
  }
]
```

Ou um objeto contendo `trades`:

```json
{
  "trades": [
    {
      "tradingDate": "2026-10-15",
      "asset": "WINFUT",
      "result": "+360"
    }
  ]
}
```

Também é aceito um objeto contendo `data` como array.

## Vínculo automático

Ao importar um trade:

- se houver exatamente um plano com a mesma data e ativo, o trade recebe automaticamente `planId` e `sessionId`;
- se houver zero ou mais de um plano compatível, o trade fica sem vínculo;
- o vínculo pode ser corrigido manualmente depois.

O `sessionId` é gerado pelo Trade Blueprint e permanece estável para aquele plano/pregão. Para WIN e WDO, contratos como `WINZ26` e `WDOX26` são reconhecidos como equivalentes a `WINFUT` e `WDOFUT` na etapa de vínculo, sem alterar o ticker original importado.

## Preenchimento da revisão

Quando trades novos são vinculados automaticamente, a aplicação pode aproveitar dados objetivos da execução para preencher:

- resumo da execução;
- resultado.

Esses campos **só são preenchidos quando ainda estão vazios**. Texto escrito manualmente pelo trader não é sobrescrito.

## Cenários previamente planejados

Um trade importado pode ser marcado como cenário A, B ou C.

O sistema considera que existe correspondência pré-planejada quando:

1. o trade está vinculado a um plano;
2. possui cenário A/B/C selecionado;
3. esse cenário contém hipótese/gatilho/ação na versão congelada mais recente — ou no plano atual, caso nunca tenha sido congelado.

Trades sem essa correspondência aparecem no indicador **sem cenário pré-planejado**.

## Duplicatas

Se existir ID externo, a deduplicação utiliza a combinação:

```text
ID externo + data + ativo + horário/preço de entrada
```

Sem ID externo, é usada uma combinação de:

- data;
- ativo;
- horários;
- preços;
- quantidade;
- resultado.

Duplicatas dentro do mesmo arquivo também são descartadas. A confirmação informa quantas linhas foram ignoradas e quantas eram duplicadas. Campos genéricos `entrada`/`saida` não são tratados como preço, para evitar interpretar datas ou horários como cotações.\n\n## Relatório conjunto

A seção Histórico mostra um relatório:

**Planejei × operei × registrei**

Ele combina:

- existência do plano;
- evidência de execução;
- quantidade de trades importados;
- aderência ao plano;
- qualidade da leitura;
- qualidade da execução;
- resultado importado ou registrado na revisão.

## Limitações atuais

A integração é baseada em arquivos locais e não acessa automaticamente contas externas.

Formatos proprietários podem exigir um adaptador específico no futuro. A arquitetura foi mantida genérica para permitir esses adaptadores sem alterar o modelo principal de planos e revisões.
