---
type: Guide
title: Criando músicas, cenas e minigames
description: Como montar um chart hoje (DSL atual) e a proposta v2 — chart declarativo com assets, atores e stage genérico, sem TypeScript para conteúdo novo.
resource: https://github.com/aqilputi/tengoku
tags: [authoring, chart, lua, dsl, cena]
timestamp: 2026-09-11T23:00:00Z
---

# Criando músicas, cenas e minigames

Como montar conteúdo hoje, onde dói, e a proposta v2. Contexto técnico:
[spec.md](spec.md) §3 (formato de chart) e [plano.md](plano.md) M4.

## Hoje (DSL v1)

Um chart é um arquivo Lua em `charts/`, avaliado uma vez na carga, dentro de
sandbox ([spec.md](spec.md) §3). Exemplo completo do que existe:

```lua
-- 1. A MÚSICA: arquivo + mapa de tempo
song({
  audio  = "assets/audio/minha.webm",  -- + .m4a de fallback (Safari)
  bpm    = 118,                         -- ou segments = {{startBeat=0, bpm=118}, ...}
  offset = 0.312,                       -- segundo do ARQUIVO onde cai o beat 0
  title  = "Minha Música",
})

-- 2. O MINIGAME e as janelas de julgamento
minigame("trio")({
  janela_perfeito = 0.045,  -- segundos
  janela_bom      = 0.09,
})

-- 3. OS EVENTOS (tudo em beats; fracionário ok)
sfx(0, "kick")               -- toca SFX agendado (sample-accurate)
cue(4, "clap1")              -- chamada: SFX + evento visual pra cena
expect(6)                    -- TOQUE DO JOGADOR esperado aqui (o Judge faz o resto)
anim(4, "lider", "preparar") -- pose declarativa ancorada em beat

-- 4. REAÇÕES (runtime, fora do caminho de áudio)
on_hit(function(judgement, beat)   -- "perfect" | "good"
  play_sfx("clap", judgement == "perfect" and "clean" or "weak")
  anim("jogador", "bater")
end)
on_miss(function(beat)
  anim("jogador", "errar")
end)
```

Mapear os toques = colocar `expect` nos beats certos. Não há lanes (1 botão).

### Onde dói (v1)

| # | Atrito | Onde está |
|---|---|---|
| 1 | Nomes de SFX (`clap1`...) precisam estar registrados à mão no `main.ts` | `main.ts` registra buffers |
| 2 | Atores/poses são código TS (`TrioScene`) — ator novo exige TypeScript | `src/render/minigames/*` |
| 3 | O chart que roda é um `import` fixo | `main.ts` |
| 4 | Descobrir o `offset` da música é no ouvido + HUD | sem ferramenta |
| 5 | Iterar chart = editar arquivo do repo e recarregar | sem hot-reload/dev-mode |

## Proposta v2 — chart declarativo completo

Princípio: **conteúdo novo não toca em TypeScript**. O chart declara assets,
atores e palco; o core ganha uma `StageScene` genérica que renderiza o que foi
declarado. As cenas TS especializadas continuam possíveis, mas deixam de ser
obrigatórias.

```lua
song({ audio = "assets/audio/minha.webm", bpm = 118, offset = 0.312, title = "Minha" })
minigame("stage")({ janela_perfeito = 0.045 })

-- NOVO: manifesto de assets — o core carrega tudo antes de começar
assets({
  sfx = {
    clap1 = "assets/sfx/clap1.wav",
    clap  = { clean = "assets/sfx/clap_clean.wav", weak = "assets/sfx/clap_weak.wav" },
  },
  sprites = {
    lider   = { idle = "assets/sprites/lider_idle.svg", bater = "assets/sprites/lider_clap.svg" },
    jogador = { idle = "...", bater = "...", errar = "..." },
  },
})

-- NOVO: atores no palco — posição relativa (0..1), sprite, pose inicial
actors({
  lider   = { sprite = "lider",   x = 0.3, y = 0.5, flip = false },
  jogador = { sprite = "jogador", x = 0.7, y = 0.5 },
})

-- eventos iguais aos de hoje; anim agora alcança QUALQUER ator declarado
cue(4, "clap1")
anim(4, "lider", "bater")
expect(6)

on_hit(function(j, b) anim("jogador", "bater") end)
on_miss(function(b) anim("jogador", "errar") end)
```

### O que o core precisa ganhar

| Peça | O quê | Esforço |
|---|---|---|
| **A. `assets{}`** | ✅ IMPLEMENTADO — DSL no LuaHost (validação de caminho em assets/), `loadManifest` no core (override local por basename > repo; ausência vira fallback: synth/vetorial); variantes registram `nome_variante` | — |
| **B. `actors{}` + StageScene** | Cena genérica: desenha atores nas posições, troca pose por `anim` (impulso volta a `idle`); `poseFor` já é o modelo | médio |
| **C. Dev-mode** | ✅ IMPLEMENTADO — `?chart=/local/meu.lua` (só caminho relativo; hot-reload por polling em dev) e `?offset` (offset finder: toca a música crua, taps no beat → média circular sugere `song{ offset }`) | — |

Falta só o B. Fluxo de autoria hoje:
1. solte a música em `public/local/music.webm` e o chart em `public/local/meu.lua`
2. abra `http://localhost:5173/?chart=/local/meu.lua&offset` → bata no beat → copie o `offset`
3. edite o chart (`song{ offset = ... }`, cues/expects, `assets{}`) — salvar recarrega sozinho
4. tire o `&offset` da URL e jogue

### O que NÃO muda

- O caminho crítico de timing (AudioClock/Scheduler/Judge) não vê nada disso —
  continua consumindo a mesma lista de eventos ordenada.
- Sandbox e circuit breaker de callbacks idem ([spec.md](spec.md) §3).
- Cenas TS especializadas continuam existindo para minigames que precisem de
  desenho custom (partículas, câmera) — a StageScene cobre o caso comum.
