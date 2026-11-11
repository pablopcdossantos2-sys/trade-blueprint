# Trade Blueprint

**Leia em outros idiomas:** [English](README.en.md) · [Español](README.es.md)

Aplicação local para preparar o trader antes do pregão, organizar estudos analíticos e comparar, depois do mercado, aquilo que foi planejado com aquilo que efetivamente aconteceu.


## Objetivo

A ferramenta não pretende prever o mercado. Ela organiza o processo decisório do trader antes da abertura, com foco em quatro perguntas:

1. **Qual é minha hipótese e quais cenários considero relevantes para o próximo pregão?**
2. **Que evidências existem contra a minha tese?**
3. **O que farei se o cenário A, B ou C se materializar?**
4. **Depois do pregão, o que o mercado fez, o que eu fiz e quanto respeitei o plano original?**

## Funcionalidades atuais — v0.12

### Sistema de trade

A seção reúne, em uma única tela, duas partes complementares do método:

- **Regras gerais:** limites de Entrada, Saída, Risco, Horário, Contexto e Comportamento, com justificativa, ativação/desativação e imagens;
- **Setups operacionais:** padrões reutilizáveis com contexto, critérios de entrada, confirmação, invalidação, stop, gestão, situações a evitar e cuidados comportamentais;
- aplicação de um setup ao cenário A de um plano.

A primeira utilização inclui registros fictícios identificados com o selo **Exemplo**. Cada exemplo pode ser removido individualmente.

### Planos de trade

- plano por ativo e data;
- viés e **convicção declarada da tese**;
- contexto, níveis, eventos e risco máximo;
- condições para não operar;
- **evidências contra a tese**;
- campo **“o que teria de acontecer para eu mudar de opinião?”**;
- cenários A/B/C;
- plano comportamental;
- imagens;
- congelamento e histórico de versões;
- revisão pós-pregão;
- comparação **Planejado × Mercado real × Minha execução**.

### Qualidade da preparação

Antes de congelar um plano, a ferramenta mostra um **score de completude da preparação** e aponta campos importantes que ainda estão vazios.

O score:

- mede apenas o preenchimento do processo;
- **não prevê o mercado**;
- **não é um sinal de entrada**;
- não impede obrigatoriamente o congelamento, mas alerta quando existem lacunas críticas.

O checklist pré-mercado agora possui estado **concluído/não concluído**.

Também é possível:

- salvar um plano como **template**;
- criar novos planos a partir de templates;
- duplicar um plano anterior **sem copiar a revisão**.

### Estudos

A seção **Estudos** é separada dos Planos de Trade e serve para análises que não precisam estar ligadas a uma operação futura.

Um estudo pode registrar:

- título e objetivo;
- ativo, timeframe e data de mercado analisada;
- hipótese inicial;
- contexto, níveis e fatores relevantes;
- contraprovas;
- cenários A/B/C;
- como o trader agiria diante daquele contexto;
- conclusão e próximos estudos;
- gráficos e imagens;
- status **Em andamento** ou **Concluído**.

### Histórico

A seção **Histórico** reúne o aprendizado acumulado:

- calendário de pregões planejados e revisados;
- filtros por ativo, setup, cenário, aderência e período;
- aderência por setup;
- regras mais violadas;
- execução planejada × parcialmente planejada × improvisada;
- qualidade da leitura × qualidade da execução;
- busca textual em planos, revisões, regras e setups;
- galeria histórica de imagens.

As revisões pós-pregão possuem campos estruturados para alimentar essas métricas sem depender apenas de interpretação de texto livre.

### Integração com diário de trades

Na seção **Histórico**, é possível importar execuções em **JSON ou CSV** e relacioná-las aos planos.

- vínculo automático por data + ativo quando há um único plano compatível;
- vínculo manual a plano e cenário A/B/C;
- importação de horários, preços, quantidade, direção e resultado;
- preenchimento não destrutivo da revisão quando possível;
- detecção de trades sem plano ou sem cenário previamente definido;
- relatório **Planejei × operei × registrei**.

Formato e exemplos: [`docs/JOURNAL-INTEGRATION.md`](docs/JOURNAL-INTEGRATION.md).

### Treinamento deliberado

A seção **Treinamento** transforma o histórico em exercícios práticos:

- Replay de planos congelados sem mostrar inicialmente o desfecho;
- revisita automática de planos com baixa aderência;
- exercícios baseados nas regras que o trader mais viola;
- comparação **“o que pensei naquela época” × “como interpreto agora”**;
- biblioteca pessoal de exemplos **corretos e incorretos** por setup.

No Replay, o mercado real e a execução original só aparecem depois que o trader registra sua nova decisão e leitura.

## Instalação e execução no Windows

Há duas formas de usar o projeto.

### Opção 1 — Instalar o aplicativo Windows

Quando houver uma versão publicada na área **Releases** do GitHub:

1. Abra a página do repositório no GitHub.
2. Entre em **Releases**.
3. Abra a versão mais recente.
4. Baixe o arquivo de instalação do Windows, normalmente com nome semelhante a:
   ```text
   Trade-Blueprint-0.x.x-Windows-x64-setup.exe
   ```
5. Dê dois cliques no arquivo baixado.
6. Siga as telas do instalador.
7. Depois da instalação, abra **Trade Blueprint** pelo Menu Iniciar.

As versões oficiais com updater habilitado poderão procurar novas versões em **Configurações > Aplicativo desktop e atualizações**.

> Se ainda não existir uma Release com instalador, use a opção abaixo.

### Opção 2 — Executar a partir do código

Esta opção é útil para testar a versão mais recente do projeto.

#### 1. Instale o Node.js

Instale uma versão atual do **Node.js LTS**.

Depois da instalação, reinicie o Prompt de Comando caso ele já estivesse aberto.

#### 2. Baixe o projeto

Na página do GitHub:

1. clique em **Code**;
2. clique em **Download ZIP**;
3. quando o download terminar, clique com o botão direito no arquivo ZIP;
4. escolha **Extrair Tudo**;
5. abra a pasta extraída.

#### 3. Abra o Prompt de Comando diretamente na pasta

Uma forma simples no Windows:

1. abra a pasta do projeto no Explorador de Arquivos;
2. clique na **barra de endereço** da pasta;
3. digite:
   ```text
   cmd
   ```
4. pressione **Enter**.

Uma janela do Prompt de Comando será aberta já na pasta correta.

#### 4. Instale as dependências

Na janela do Prompt de Comando, digite:

```bash
npm install
```

Pressione **Enter** e aguarde o comando terminar.

Você normalmente só precisa repetir `npm install` quando baixar uma versão nova do projeto ou quando as dependências forem alteradas.

#### 5. Inicie o programa

Digite:

```bash
npm run dev
```

Quando aparecer uma linha parecida com:

```text
Local: http://localhost:5173/
```

abra esse endereço no navegador.

Em muitos terminais, também é possível segurar **Ctrl** e clicar no endereço.

#### 6. Não feche o Prompt de Comando enquanto estiver usando a versão web

O terminal precisa permanecer aberto enquanto o servidor local estiver rodando.

Para encerrar:

1. volte ao Prompt de Comando;
2. pressione **Ctrl + C**;
3. se o Windows pedir confirmação, responda conforme indicado na tela.

### Verificação opcional

Para verificar se o código TypeScript está consistente:

```bash
npm run typecheck
```

Para gerar uma compilação de produção:

```bash
npm run build
```

A compilação e geração do instalador desktop exigem ferramentas adicionais. Consulte [`docs/DESKTOP.md`](docs/DESKTOP.md) somente se você pretende desenvolver ou empacotar o aplicativo.

