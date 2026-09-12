# LOG — Tengoku

Log de decisões, pesquisa e progresso. Entradas mais recentes no topo.
Cada entrada: data, tipo (`decisão` | `pesquisa` | `progresso` | `grading`), resumo.

---

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

As três frentes concluíram (relatórios consolidados em [PESQUISA.md](PESQUISA.md)).
Núcleo da spec **validado**: relógio mestre = áudio é unânime; janelas ±45/±90 ms são
exatamente o StepMania Judge 4 e o FNF atual; wasmoon confirmado com precedente real.

Ajustes A1–A12 adotados e aplicados como adendo no [PLANO.md](PLANO.md). Principais:
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

Disparada pesquisa em três frentes (resultados consolidados em [PESQUISA.md](PESQUISA.md)):

1. **Engines de ritmo web existentes** — Bemuse, taiko-web, FNF e afins: como sincronizam
   áudio, agendam notas, julgam input e calibram latência.
2. **Referências canônicas de timing Web Audio** — "A Tale of Two Clocks", Tone.js,
   suporte real de `outputLatency`, confiabilidade de `e.timeStamp`, janelas de
   julgamento de osu!/StepMania/Rhythm Heaven, throttling de aba oculta.
3. **wasmoon** — atividade do projeto, integração com Vite, API de callbacks,
   práticas de sandbox, comparação com fengari.

Motivação: o plano (PLANO.md) foi derivado apenas da SPEC.md, sem validação externa.

## 2026-09-11 — decisão — Documentação reorganizada em formato OKR

Estrutura: OKR.md (objetivos e key results do ciclo v1, formato Google com
scoring 0.0–1.0) → SPEC.md (o quê/como técnico) → PLANO.md (execução M0–M7)
→ PESQUISA.md (evidências externas) → LOG.md (este arquivo).

## 2026-09-11 — progresso — Plano de implementação (Fable)

`docs/PLANO.md` produzido por agente de planejamento (modelo Fable) a partir da SPEC:
tipos centrais únicos em `src/core/types.ts`, interfaces TS concretas de todos os
módulos, decisões em aberto resolvidas (pareamento nearest-na-janela; pause =
`ctx.suspend()` sem desagendamento; pool de GainNodes; chart Lua → builder JS direto),
estratégia de testes (vitest + MockAudioContext vs. procedimentos manuais),
dependências pinadas. Commit `669b18f6`.

Limitação registrada: o plano não consultou repositórios externos — motivou a
entrada de pesquisa acima.

## 2026-09-11 — progresso — Repositório criado

Repo público `aqilputi/tengoku` no GitHub; jj colocated (`jj git init --colocate`),
bookmark `main`. SPEC.md commitada (`b2e4e387`) e pushed.

## 2026-09-11 — decisão — Stack e arquitetura (SPEC.md)

TS + Vite + Web Audio API no caminho crítico; Lua (wasmoon) como camada declarativa
de chart, nunca no caminho de agendamento; Canvas 2D; build estático sem backend.
Relógio mestre = relógio de áudio; tudo é função de `songTime`. Ver SPEC.md §0–§2.
