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

### Planejamento de trades

A seção **Planejamento** reúne, em uma única área, a preparação de pregões e o acompanhamento de oportunidades que podem se tornar trades futuros.

- **Planos de pregão:** registros por ativo e data, com viés, convicção, contexto, níveis, eventos, risco máximo, condições para não operar, evidências contra a tese, cenários A/B/C, plano comportamental, imagens e revisão pós-pregão.
- **Oportunidades futuras:** análises de mercado que ainda não pertencem a um pregão específico. Podem conter ativo, timeframe, hipótese, contexto, níveis, contraprovas, cenários, conclusão e aprendizados.
- Uma oportunidade pode ser transformada em um plano de pregão. A análise original permanece preservada, e o novo plano passa a ser um registro independente.
- Modelos de plano podem ser reutilizados como ponto de partida; cada novo plano continua editável e independente.

Antes de executar um plano, o usuário pode **registrar uma versão de referência**. O aplicativo salva uma cópia numerada do planejamento naquele momento. Essa cópia permanece inalterada para comparação posterior com o mercado e a execução. Para mudar o plano depois, cria-se uma nova versão editável. Isso não envia ordens nem impede operações no mercado.

### Qualidade da preparação

Antes de registrar uma versão de referência, a ferramenta mostra um **score de completude da preparação** e aponta campos importantes que ainda estão vazios.

O score:

- mede apenas o preenchimento do processo;
- **não prevê o mercado**;
- **não é um sinal de entrada**;
- alerta sobre lacunas críticas, sem necessariamente impedir o registro da versão.

O checklist pré-mercado possui estado **concluído/não concluído**.

É possível salvar um plano como modelo, criar novos planos a partir de modelos e duplicar um plano anterior sem copiar a revisão.

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

