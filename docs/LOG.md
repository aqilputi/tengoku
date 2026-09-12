# LOG — Tengoku

Log de decisões, pesquisa e progresso. Entradas mais recentes no topo.
Cada entrada: data, tipo (`decisão` | `pesquisa` | `progresso` | `grading`), resumo.

---

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
