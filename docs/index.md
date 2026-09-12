---
type: Bundle Index
title: Tengoku — documentação
description: Bundle OKF do projeto — engine de jogo de ritmo para browser com charts em Lua.
resource: https://github.com/aqilputi/tengoku
tags: [tengoku, índice]
timestamp: 2026-09-11T21:00:00Z
---

# Tengoku — documentação

Bundle no [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/):
1 arquivo = 1 conceito; frontmatter YAML consultável; links formam o grafo.

## Conceitos

| Conceito | Tipo | O quê |
|---|---|---|
| [spec.md](spec.md) | Specification | O quê/como técnico: arquitetura, timing, chart Lua, armadilhas |
| [plano.md](plano.md) | Implementation Plan | Execução M0–M7: interfaces TS, decisões, aceites, adendo A1–A12 |
| [pesquisa.md](pesquisa.md) | Research Report | Evidência externa (Bemuse/taiko-web/FNF/Tone.js/wasmoon) |
| [deploy.md](deploy.md) | Runbook | Build, headers e matriz de dispositivos |
| [authoring.md](authoring.md) | Guide | Como criar músicas/cenas hoje e a proposta de DSL v2 |
| [log.md](log.md) | Log | Histórico cronológico (reservado OKF) |

## Grafo

[spec.md](spec.md) → validada por [pesquisa.md](pesquisa.md) → ajusta [plano.md](plano.md)
→ verificado por [deploy.md](deploy.md); tudo registrado em [log.md](log.md).
