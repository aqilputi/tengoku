---
type: Log
title: Histórico do projeto
description: Histórico cronológico de decisões, pesquisa e progresso (mais recente no topo).
resource: https://github.com/aqilputi/tengoku
tags: [log, decisões]
timestamp: 2026-09-11T21:00:00Z
---

# LOG — Tengoku

Log de decisões, pesquisa e progresso. Entradas mais recentes no topo.
Cada entrada: data, tipo (`decisão` | `pesquisa` | `progresso` | `grading`), resumo.

---

## 2026-09-11 — decisão — Guia de authoring + proposta DSL v2

Criado [authoring.md](authoring.md): como montar chart hoje (song/minigame/sfx/
cue/expect/anim/on_hit/on_miss) e os 5 atritos da v1 (SFX registrados à mão no
main, atores em TS, chart hardcoded, offset no ouvido, sem dev-mode). Proposta
v2: `assets{}` (manifesto carregado pelo core), `actors{}` + StageScene genérica
(conteúdo novo sem TypeScript), dev-mode `?chart=` com hot-reload e offset
finder. Ordem: A (assets) → C (dev-mode) → B (actors/stage).

## 2026-09-11 — progresso — Sprites originais "Palmitos" + override local de imagens (121 testes)

O pack baixado também não tem sprites de gameplay (busca clap/pachi/trio vazia —
só logos animados e artes avulsas). Entregue no lugar: sprites SVG ORIGINAIS de
design próprio ("Palmitos": criatura-gota com antena, 3 cores × poses idle/clap
+ sad do jogador) em public/assets/sprites/, commitáveis. TrioScene ganhou
setSprites/poseFor (pose = f(visualBeat), testada) com drawImage + bounce no
clap e fallback vetorial. tryLoadImage no AssetLoader (testado): override em
public/local/trioN_pose.{png,svg} tem prioridade sobre os sprites do repo.

## 2026-09-11 — decisão — RhythmHeavenResourcesPack inspecionado: sem áudio; repo protegido

O pack baixado pelo usuário (4.3 GB dentro do diretório do repo!) contém apenas
material visual — logos, box arts, fontes (607 svg / 598 png / 576 ai); a pasta
"Complete Music Collection" é só arte de capa. Zero arquivos de áudio. Nada
utilizável para o jogo (e identidade visual da Nintendo não seria integrada de
qualquer forma). Ação: RhythmHeavenResourcesPack/ no .gitignore ANTES de qualquer
snapshot do jj — evitou 4.3 GB de material de terceiros no histórico público.
Recomendado mover a pasta para fora do repo. Música demo original permanece.

## 2026-09-11 — decisão/progresso — Música demo original; repos de assets de terceiros avaliados e recusados

Avaliados HeavenStudioPlus (MIT no código, mas CREDITS.md declara "Original sounds
by Nintendo"; song.wav de 6MB sem proveniência) e Tailx501/RhythmHeavenResourcesPack
(GPL-3.0 no repo, mas CREDITS.md credita "Ripping Reapers" — música ripada dos
jogos). Conclusão: as licenças dos repositórios não alcançam o áudio da Nintendo;
nada foi baixado. Uso local por conta do usuário continua possível via public/local/.

Solução entregue: faixa demo ORIGINAL gerada por script (48.8s @ 118 BPM, beat 0 em
t=0, kick/hat/bass/pad, progressão Am–F–C–G), codificada em WebM/Opus + AAC (cadeia
A11) e commitada em public/assets/audio/trio.{webm,m4a}. main.ts resolve a música:
override local > caminho do chart (webm → m4a). Com isso o pipeline real de
decodificação e o alinhamento música↔cues ficam testáveis de ponta a ponta.

## 2026-09-11 — progresso — Minigame "trio" (mecânica do The Clappy Trio) + docs em OKF (118 testes)

Pesquisada a mecânica do The Clappy Trio (Rhythm Tengoku) em wikis de fãs: fila de
três, os dois primeiros batem em sequência, o jogador (3º) fecha mantendo o
intervalo; vereditos perfeito/quase("tick")/miss com a fila encarando o jogador no
erro. Reproduzida SÓ a mecânica: charts/trio.lua (fases de 1 beat, meio beat e
alternadas, 118 BPM), TrioScene com três personagens ORIGINAIS (cápsulas listradas,
design próprio) e sons sintetizados. Testes garantem a estrutura (toda sequência é
clap1→clap2→expect com gaps iguais ∈ {1, 0.5}; frases não se sobrepõem).

Assets locais: public/local/ (gitignore) com README — o jogo tenta carregar
música/claps de lá via tryLoadAudio (fontes em ordem, nunca lança, null ⇒ synth)
e usa override do usuário quando presente. Material de terceiros não entra no repo
e não é baixado pelo projeto.

Documentação convertida de OKR (leitura errada minha) para OKF — ver entrada acima.

## 2026-09-11 — decisão — Documentação convertida para OKF (Open Knowledge Format)

Correção de rumo: o formato pedido era o [OKF do Google Cloud](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
(markdown + YAML frontmatter, 1 arquivo = 1 conceito, bundle com [index.md](index.md)
e log.md reservado, links formando grafo) — não OKR. OKR.md removido; conceitos
renomeados para minúsculas ([spec.md](spec.md), [plano.md](plano.md),
[pesquisa.md](pesquisa.md), [deploy.md](deploy.md)); frontmatter com
type/title/description/resource/tags/timestamp em todos; [index.md](index.md) criado.

## 2026-09-11 — decisão — Assets locais para teste (fora do repo)

`public/local/` adicionado ao .gitignore: diretório para o usuário colocar assets
próprios de teste local (música/SFX). O AssetLoader tenta carregar de lá e cai para
os sons sintetizados quando ausente. Assets de terceiros NUNCA entram no repositório
(spec §6); o assistente não baixa material da Nintendo — o slot existe para arquivos
que o usuário já possua, sob responsabilidade dele.

## 2026-09-11 — progresso — M7: artefatos de deploy prontos

`public/_headers` (Cloudflare Pages, copiado pro dist no build — verificado),
`deploy/nginx.conf.example` (MIME wasm, immutable/no-cache, gzip sem áudio) e
`docs/deploy.md` com os comandos curl de verificação de headers e a matriz de
teste manual (Chrome/Firefox/Safari/Android/iOS; aceite = iPhone + Bluetooth).
Bundle final: wasm 271KB (111KB gz) + js 140KB (47KB gz).

Estado do ciclo: M0–M6 implementados com 107 testes verdes; M7 automatizável
pronto. Restam os aceites MANUAIS: ouvir metrônomo 3min (M1), allocation
profiling (M2/M5), feel de julgamento (M3), teste de corredor (M6), matriz de
dispositivos (M7). CI aguarda destravamento de billing da conta GitHub.
Sem assets ainda: sons sintetizados e personagens em canvas (arte/música
originais pendentes — SPEC §6).

## 2026-09-11 — progresso — M6 implementado (107 testes verdes)

Fluxo completo: boot → menu → calibração obrigatória no 1º uso → jogo → tela de
resultado (faixas superb/ok/try_again, não nota) → replay. TDD na lógica pura:
Settings (storage injetável; corrompido/versão errada ⇒ defaults; clamp A6
−200..+500ms), computeCalibration (descarta 4 primeiras + outliers >250ms,
mediana, <8 válidas ⇒ retry, NEGATIVO permitido), computeRank (superb exige zero
miss/extra + ≥60% perfect — miss quebra superb, fiel ao RH), applyAutosound (A7:
offset ≥10ms ⇒ clap agendado no beat, caminho reativo suprimido; imutável),
breakdown do Judge (perfects/goods/omissions/extras).

Bug pego na revisão pós-gate: InputManager preso ao clock de boot enquanto cada
partida cria clock novo ⇒ conversões erradas. Fix: setClock() (limpa a fila),
com teste de troca de relógio entre partidas. Telas em DOM puro (menu,
calibração às cegas com contador, resultado com replay).

Aceite manual M6 pendente: teste de corredor (2 pessoas, localStorage limpo).

## 2026-09-11 — progresso — M5 implementado: chart Lua dirige o jogo (85 testes verdes)

A parte automatizável do aceite M5 virou **teste de integração ponta-a-ponta**
(test/integration/gameloop.test.ts) rodando charts/musica1.lua REAL pelos módulos
reais nos 3 cenários do aceite: (A) jogador perfeito — 24/24 perfect, erro médio 0,
Lua reage a cada hit (clap_clean/bater), zero drop no scheduler; (B) sem tocar —
24 misses por omissão, jogo não trava; (C) esmagando input a 50ms — contabilidade
fecha (hits+misses == julgamentos), nenhum cue pendente. Quarto cenário: chart
HOSTIL com on_miss que lança — julgamento completa, breaker arma em 5.

ClappyScene: animação como função pura de beat (impulse), estado por âncoras,
zero alocação no draw; personagens em canvas até a arte existir. main.ts final:
boot → LuaHost(wasm via ?url) → chart → TempoMap/Scheduler/Judge/cena → play;
erro de chart é tela fatal-amigável.

Guard anti-CDN testado: em browser, LuaHost.create() sem wasmUri lança (o default
do wasmoon buscaria unpkg em runtime). Preview verificado: glue.wasm servido local
com MIME application/wasm.

Aceite manual M5 pendente: jogar no browser (visual/feel), trocar de aba no meio.

## 2026-09-11 — progresso — M4 implementado via TDD (74 testes verdes; aceite M4 automatizado)

LuaHost + api.ts + charts/musica1.lua, red→green no vitest (wasmoon roda em Node).
**Aceite do M4 é um teste**: o chart do M3 reescrito em Lua produz lista de eventos
idêntica (`toEqual`). Sandbox A5 verificado por teste (io/os/require/package/load/
loadfile/dofile/debug/collectgarbage/print e string.dump nil; stdlib segura intacta).
Validação pós-carga: song{} exatamente 1x, beats finitos ≥0, bpm >0, audio em
assets/, sintaxe/runtime error ⇒ ChartLoadError sem estado parcial. Callbacks:
on_hit/on_miss com try/catch e circuit breaker (5 erros ⇒ desativa; jogo segue).
DSL: song/minigame curried/sfx/cue/expect/anim (forma dupla: declarativa na carga,
runtime em callback) + play_sfx via handlers.

Descoberta de API: `setMemoryMax` exige `traceAllocations: true` no createEngine
(custo só na VM Lua — carga + callbacks esparsos, fora do caminho de áudio).
Chart real importado nos testes via `?raw` (pipeline Vite no vitest). luacheck
0/0 no chart real (`unused_args = false`: assinatura de callback é fixa). CI agora
roda também setup-lua + lint-chart + fmt-chart-check.

Pendente (M5): integrar LuaHost no main.ts (chart Lua dirigindo o jogo) — exige
o glue `?url` do wasm no browser (teste offline pendente de CI destravado).

## 2026-09-11 — progresso — M3 implementado via TDD (57 testes verdes)

Judge + InputManager, red→green. Matriz de pareamento completa como teste: input
exato ⇒ perfect 0ms; bordas ±45/±46/±90/±91 inclusive; input sem cue ⇒ miss
explícito (regra RH, A9); 2 inputs → 1 cue ⇒ hit + extra-miss; anti-roubo (nearest
pendente NA janela — cue mais próximo ganha, input cedo não rouba o seguinte); cue
acertado não pareia de novo; miss por omissão emitido no instante da expiração;
cue expirado não pareia com input atrasado; stats média/mediana; reset.

InputManager: sanity A4 por evento (epoch/negativo/futuro ⇒ relógio atual), flag
do boot, e.repeat ignorado, dedupe 30ms por tecla (bounce), fila circular 64 com
descarte do mais antigo, drain com mutação in-place (zero alocação), clear() no
resume. Demo main.ts atualizado: expect em cada beat, feedback audível imediato
via playNow (fora do lookahead, A2), anel visual de veredito, HUD com erro por
batida. Correção de narrowing do tsc no loop de expiração. Bundle 5.8 KB gzip.

Aceite manual M3 pendente: jogar 32 beats e conferir mediana humana (~±20–40ms)
no HUD; bater fora de propósito e ver "MISS (extra!)".

## 2026-09-11 — progresso — M0+M1+M2 implementados via TDD (36 testes verdes)

Red→green por módulo. Gate de qualidade: `pixi run gate` = tsc strict + vitest + build,
rodando também no CI (GitHub Actions + setup-pixi). npm audit limpo (vitest 3→5 por
advisory dev-only). Bundle: 10.9 KB (4 KB gzip).

Implementado: types, TempoMap (multi-segmento, validação), AudioClock (clock híbrido
A3, fallback de latência, pause/resume com re-âncora perf↔ctx, drift observável),
SfxPlayer (pool de 16 GainNodes, warmup A8, nome desconhecido não lança), Scheduler
(ticker em Web Worker A1, lookahead 100ms A2, cursor monotônico, drop de evento
atrasado com contagem), Renderer (DPI, FPS throttled), boot (gesto + sanity de
e.timeStamp A4), DiagnosticsHud (F1), demo de metrônomo 3min/120BPM em main.ts.

NFRs como teste executável: currentTime granular de 20ms ⇒ songTime monotônico com
passos ≤5ms; tick atrasado 300ms ⇒ nada pulado/duplicado; stall de 600ms ⇒ eventos
vencidos dropados, nunca tocados atrasados; 8 SFX/s por 30s sem drop e sem `when` no
passado; pool de gains nunca cresce no caminho quente; drift 3min ≈ 0 no mock.

Correções que os testes forçaram: outputLatency=0 explícito é "disponível" (não cai
pro baseLatency); decisões de agendamento/drop movidas pro relógio ctx cru (offsets
de percepção não pertencem ao agendamento).

Pendente de aceite manual (M1/M2): ouvir metrônomo de 3min com HUD aberto (drift <5ms)
e allocation profiling no DevTools. `pixi run dev` → tela "toque para começar".

## 2026-09-11 — progresso — pixi instalado e ambiente resolvido

`pixi install` verde: node 22.23.2, lua 5.4.8, stylua 2.5.2, lua-language-server 3.19,
luacheck 1.2.0. `pixi.lock` commitado. Ajustes no caminho: win-64 removido das
plataformas (luarocks/lua-language-server sem build Windows no conda-forge); o manifest
global do luarocks.org estoura o loader do Lua 5.4 ("more than 65536 constants",
luarocks 3.13) → task `setup-lua` usa manifests por usuário (argparse/hisham/
lunarmodules) com `--tree` no env do pixi. Sanity check: luacheck aceita a DSL e
flaga `os`/`io`/`print` (globals removidos pelo sandbox) em chart malicioso.

## 2026-09-11 — decisão — pixi como toolchain manager; tooling Lua para charts

Adotado [pixi](https://pixi.sh) (prefix.dev, conda-forge) como camada de toolchain e
task runner: pina node 22 + lua 5.4 + stylua + lua-language-server num lockfile único.
O lado JS continua npm (`package.json` é a fonte de wasmoon/vite/vitest) — pixi não
substitui o npm, embrulha ele (`pixi run dev|build|test`).

Sobre "gerenciar projeto Lua": aqui Lua é conteúdo (charts no wasmoon, browser), não
aplicação — sem rockspec no build. Gestão = `.luacheckrc` (globals da DSL declarados,
globals proibidos pelo sandbox marcados como erro), `stylua.toml`, `.luarc.json` +
`lua-types/chart-api.lua` (stubs `---@meta` → autocomplete da DSL no editor). A
validação real dos charts segue sendo os testes vitest do LuaHost (PLANO M4).
Se um dia charts virarem pacotes distribuíveis: luarocks + rockspec + busted.

## 2026-09-11 — pesquisa/decisão — Resultados da pesquisa externa: 12 ajustes adotados

As três frentes concluíram (relatórios consolidados em [pesquisa.md](pesquisa.md)).
Núcleo da spec **validado**: relógio mestre = áudio é unânime; janelas ±45/±90 ms são
exatamente o StepMania Judge 4 e o FNF atual; wasmoon confirmado com precedente real.

Ajustes A1–A12 adotados e aplicados como adendo no [plano.md](plano.md). Principais:
tick do Scheduler em **Web Worker**; lookahead 200→**100 ms** com SFX de input fora do
lookahead; **clock híbrido** (média móvel perf↔ctx, 60 amostras) contra `currentTime`
granular no Android; wasmoon **1.16.0 pinado** + `glue.wasm` via `?url` (default busca
CDN unpkg!); sandbox ampliado (`debug`, `string.dump`, `collectgarbage`, `print`);
calibração com offset negativo e duas fases; **autosound** ≥10 ms; warmup de pipeline;
música WebM/Opus + fallback AAC (Safari não decodifica OGG).

Anti-padrões observados a evitar: relógio de frame com resync em degraus (FNF legacy,
taiko-web — anos de issues de desync); janelas em % de scroll speed (Rhythm Plus);
clamp de offset em ≥0 (Bemuse #531).

## 2026-09-11 — pesquisa — Pesquisa de requisitos em repositórios externos

Disparada pesquisa em três frentes (resultados consolidados em [pesquisa.md](pesquisa.md)):

1. **Engines de ritmo web existentes** — Bemuse, taiko-web, FNF e afins: como sincronizam
   áudio, agendam notas, julgam input e calibram latência.
2. **Referências canônicas de timing Web Audio** — "A Tale of Two Clocks", Tone.js,
   suporte real de `outputLatency`, confiabilidade de `e.timeStamp`, janelas de
   julgamento de osu!/StepMania/Rhythm Heaven, throttling de aba oculta.
3. **wasmoon** — atividade do projeto, integração com Vite, API de callbacks,
   práticas de sandbox, comparação com fengari.

Motivação: o plano (plano.md) foi derivado apenas da spec.md, sem validação externa.

## 2026-09-11 — decisão — Documentação reorganizada em formato OKR

Estrutura: spec.md (o quê/como técnico) → plano.md (execução M0–M7)
→ pesquisa.md (evidências externas) → log.md (este arquivo).

## 2026-09-11 — progresso — Plano de implementação (Fable)

`docs/plano.md` produzido por agente de planejamento (modelo Fable) a partir da SPEC:
tipos centrais únicos em `src/core/types.ts`, interfaces TS concretas de todos os
módulos, decisões em aberto resolvidas (pareamento nearest-na-janela; pause =
`ctx.suspend()` sem desagendamento; pool de GainNodes; chart Lua → builder JS direto),
estratégia de testes (vitest + MockAudioContext vs. procedimentos manuais),
dependências pinadas. Commit `669b18f6`.

Limitação registrada: o plano não consultou repositórios externos — motivou a
entrada de pesquisa acima.

## 2026-09-11 — progresso — Repositório criado

Repo público `aqilputi/tengoku` no GitHub; jj colocated (`jj git init --colocate`),
bookmark `main`. spec.md commitada (`b2e4e387`) e pushed.

## 2026-09-11 — decisão — Stack e arquitetura (spec.md)

TS + Vite + Web Audio API no caminho crítico; Lua (wasmoon) como camada declarativa
de chart, nunca no caminho de agendamento; Canvas 2D; build estático sem backend.
Relógio mestre = relógio de áudio; tudo é função de `songTime`. Ver spec.md §0–§2.
