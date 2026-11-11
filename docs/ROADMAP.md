# Roadmap — Trade Blueprint

## Fase 1 — MVP de planejamento ✅

- [x] React + TypeScript.
- [x] Persistência local.
- [x] Regras do sistema de trade.
- [x] Planos por ativo e pregão.
- [x] Cenários A/B/C.
- [x] Plano comportamental.
- [x] Revisão pós-pregão.
- [x] Imagens compactadas.
- [x] Backup/restauração em JSON.
- [x] Configurações e temas.

## Fase 2 — Integridade do processo decisório ✅

### Congelamento/versionamento

- [x] Estados Rascunho e Congelado.
- [x] Snapshot imutável ao congelar o plano.
- [x] Histórico numerado de versões.
- [x] Criação de nova versão sem apagar a anterior.
- [x] Bloqueio dos campos de planejamento enquanto congelados.
- [x] Preservação da revisão como área separada e editável.

### Biblioteca de setups

- [x] CRUD de setups.
- [x] Contexto, entrada, confirmação e invalidação.
- [x] Stop, alvo, restrições e comportamento.
- [x] Imagens por setup.
- [x] Aplicação de setup ao plano diário.

### Contraprova da tese

- [x] Campo “Evidências contra minha tese / por que posso estar errado?”.
- [x] Inclusão no snapshot congelado.
- [x] Inclusão no comparador e exportação textual.

### Planejado × Mercado real × Minha execução

- [x] Comparador visual em três colunas.
- [x] Planejado baseado na última versão congelada.
- [x] Sinalização explícita quando não há versão congelada.
- [x] Campo separado para comportamento do mercado.
- [x] Campo separado para execução real do trader.
- [x] Desvios, aderência, resultado e aprendizado.

### Dados

- [x] Schema v2.
- [x] Migração automática de backups/dados v1.
- [x] Backups continuam incluindo imagens e agora incluem setups e snapshots.

## Fase 2.5 — Internacionalização ✅

- [x] Interface em Português (Brasil), English e Español.
- [x] Seletor de idioma persistente nas configurações.
- [x] Datas e horários formatados conforme o idioma selecionado.
- [x] Dados do trader mantidos semanticamente estáveis, sem tradução destrutiva dos valores persistidos.
- [x] Schema v3 com migração automática de v1 e v2.
- [x] README completo em PT-BR, inglês e espanhol, com navegação cruzada entre idiomas.

## Fase 2.6 — Estudos analíticos ✅

- [x] Seção Estudos separada de Planos de Trade.
- [x] Modelo de dados próprio para estudos.
- [x] Título, datas, ativo opcional e timeframe/recorte.
- [x] Pergunta/objetivo analítico.
- [x] Contexto, níveis, eventos e contraprova da hipótese.
- [x] Cenários A/B/C reutilizando a lógica analítica dos planos.
- [x] Campo “como eu agiria” para treino de decisão.
- [x] Conclusão, aprendizados e próximos estudos.
- [x] Imagens, status Em andamento/Concluído e exportação textual.
- [x] Suporte trilíngue desde o lançamento da funcionalidade.
- [x] Schema v4 e migração automática de v1, v2 e v3.

## Fase 3 — Qualidade da preparação ✅

- [x] Score de preparação antes do congelamento.
- [x] Alertas para campos críticos ausentes: invalidação, risco, contraprova e condições de não operação.
- [x] Checklist com estado concluído/não concluído, e não apenas texto.
- [x] Classificação de convicção da tese sem transformar convicção em sinal operacional.
- [x] Campo “o que teria de acontecer para eu mudar de opinião?”.
- [x] Templates de plano por mercado/ativo.
- [x] Duplicar plano anterior sem copiar revisão.

## Fase 4 — Aprendizado histórico ✅

- [x] Calendário de pregões planejados e revisados.
- [x] Filtros por ativo, setup, cenário, aderência e período.
- [x] Painel de aderência por setup.
- [x] Violações de regras mais frequentes.
- [x] Operações planejadas × improvisadas.
- [x] Qualidade da leitura × qualidade da execução.
- [x] Busca textual em planos, regras e setups.
- [x] Galeria histórica de imagens.

## Fase 5 — Integração com diário de trades ✅

- [x] Identificador comum entre plano, pregão e trade registrado.
- [x] Vincular trades executados ao plano e cenário correspondente.
- [x] Importar automaticamente resultado e dados objetivos da execução quando possível.
- [x] Comparar “planejei operar” × “operei” × “registrei no diário”.
- [x] Detectar trades sem cenário previamente definido.
- [x] Relatórios conjuntos de processo + resultado.

## Fase 6 — Desktop e robustez

- [x] Tauri 2.
- [x] Instalador Windows NSIS.
- [x] Instância única.
- [x] Infraestrutura de updater assinado via GitHub Releases públicas.
- [x] Painel de atualização dentro da aplicação.
- [ ] Primeira Release Windows assinada e teste end-to-end de atualização vA → vB.

  **Status da Release assinada:** o pipeline Windows completo foi validado em 16/10/2026: frontend, Rust, testes, Clippy, build NSIS e upload do instalador `trade-blueprint-windows` passaram. O artefato CI foi gerado com sucesso. A publicação oficial assinada e o teste vA → vB continuam bloqueados somente pela ausência de `TAURI_UPDATER_PUBLIC_KEY` e `TAURI_SIGNING_PRIVATE_KEY` no GitHub; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` deve ser configurado se a chave privada usar senha.
- [x] CI Windows para validar e gerar instalador.
- [x] SQLite.
- [x] Migração do armazenamento web para banco local.
- [x] Backups automáticos rotativos.
- [x] Pasta configurável de backup.
- [x] Restauração e validação de integridade.
- [x] Maior capacidade para imagens.

## Fase 7 — Treinamento deliberado ✅

- [x] Modo Replay de decisão: ocultar o que aconteceu após o ponto planejado e pedir nova decisão.
- [x] Revisitar planos com baixa aderência.
- [x] Exercícios baseados nos próprios erros recorrentes do trader.
- [x] Comparação “o que pensei naquele momento” × “como interpreto agora”.
- [x] Biblioteca pessoal de exemplos corretos e incorretos de cada setup.


## Fase 8 — Robustez de dados e anexos

### Concluído nesta auditoria

- [x] Impedir sobrescrita automática após falha de leitura do armazenamento web.
- [x] Bloquear salvamento desktop quando o estado SQLite não puder ser interpretado.
- [x] Validar backup completo no frontend antes de restaurá-lo no SQLite.
- [x] Exigir backup `pre-restore` bem-sucedido antes da restauração.
- [x] Diferenciar “estado salvo” de “backup automático falhou”.
- [x] Usar o dia local do usuário para a rotação diária de backups desktop.
- [x] Preservar rascunhos de planos e estudos ao trocar de aba.
- [x] Corrigir “Salvar e fechar” para não fechar um plano inválido.
- [x] Corrigir datas brasileiras com horário na importação do diário.
- [x] Aceitar campos CSV multilinha entre aspas.
- [x] Corrigir métrica de aderência integral para nunca superar 100%.
- [x] Evitar race condition entre edição de texto e compressão de anexos.
- [x] Limpar referências a regras/setups removidos.
- [x] Sugerir próximo dia útil em vez de sábado/domingo.
- [x] Tornar atualização de `Cargo.lock` deliberada, não automática.

### Próxima evolução estrutural

- [x] Migrar anexos para armazenamento deduplicado por ID: arquivos físicos na pasta de dados do desktop e IndexedDB na versão web, mantendo backups JSON autocontidos e migração transparente do schema v9.
- [x] Fazer snapshots referenciarem anexos sem duplicar a mesma imagem em base64 no JSON persistido (schema v9 + `attachmentData`).
- [x] Definir política de retenção para backups `pre-update` e `pre-restore`: manter as 5 cópias mais recentes de cada tipo, sem rotacionar backups manuais.
- [x] Substituir a tradução baseada em `MutationObserver` por internacionalização declarativa no React, aplicada no runtime JSX durante a renderização sem reescrever o DOM.
- [x] Revisar a galeria para abrir imagens via Blob/Object URL no WebView2, com revogação automática ao fechar a visualização.
- [x] Adicionar testes automatizados para importação CSV/JSON, datas, migrações, deduplicação de imagens, retenção de backups e proteção contra perda de dados.


## Fase 9 — Simplificação do fluxo de uso

- [x] Reunir regras gerais e setups operacionais na seção principal **Sistema de trade**, preservando as duas categorias e todos os vínculos existentes.
- [x] Explicar por que regras gerais e setups são partes complementares, sem duplicar cadastros nem exigir navegação entre áreas separadas.
- [x] Adicionar informação contextual clicável aos padrões usados como ponto de partida na criação de planos.
- [x] Substituir títulos de efeito por títulos objetivos e subtítulos que descrevem a tarefa de cada seção.
- [x] Incluir registros fictícios identificados como **Exemplo** nas áreas de dados, com exclusão individual.
- [x] Inserir os exemplos apenas uma vez por instalação/estado, sem recriá-los após a exclusão deliberada.
- [x] Criar uma identidade visual única para o ícone da aplicação, o menu e o favicon.
- [x] Remover a seção **Documentação** dos READMEs em português, inglês e espanhol.
- [ ] Validar tipagem, testes, build web e empacotamento Windows após as alterações.


## Fase 10 — Planejamento integrado e linguagem clara

- [x] Configurar a janela principal do aplicativo desktop para iniciar maximizada.
- [x] Remover **Padrões de planejamento** de Configurações e levar ativos e limites iniciais para a área **Planejamento**.
- [x] Reunir **Planos de trade** e **Estudos** em uma única área, com registros de planos de pregão e oportunidades futuras.
- [x] Permitir transformar uma oportunidade futura em um plano de pregão independente, preservando a análise original.
- [x] Explicar o conceito de **versão de referência** no próprio editor e substituir o termo técnico “plano congelado” nos textos apresentados ao usuário.
- [x] Remover as abas de **Regras gerais** e **Setups operacionais** e apresentar ambas as categorias em uma página contínua do **Sistema de trade**.
- [x] Atualizar traduções e READMEs em português, inglês e espanhol para refletir a nova organização.
- [ ] Validar testes, tipagem, build web e empacotamento NSIS no Windows.
