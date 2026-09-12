---
type: Runbook
title: Deploy e verificação de produção
description: Checklist de build/headers e matriz de teste manual em dispositivos reais (aceite M7 do [plano.md](plano.md)).
resource: https://github.com/aqilputi/tengoku
tags: [deploy, runbook, headers]
timestamp: 2026-09-11T21:00:00Z
---

# DEPLOY — checklist (M7)

Build: `pixi run build` → `dist/` estático. Alvos: Cloudflare Pages
(`public/_headers` já entra no build) ou nginx (`deploy/nginx.conf.example`).

## Verificação de headers (obrigatória a cada deploy)

```sh
BASE=https://seu-dominio
# wasm: MIME correto + immutable
curl -sI $BASE/assets/$(ls dist/assets/*.wasm | xargs basename) | grep -Ei "content-type|cache-control"
#   esperado: application/wasm · public, max-age=31536000, immutable
# js com hash: immutable + comprimido
curl -sI -H "Accept-Encoding: br, gzip" $BASE/assets/$(ls dist/assets/*.js | xargs basename) \
  | grep -Ei "cache-control|content-encoding"
# index: no-cache
curl -sI $BASE/ | grep -i cache-control
```

## Matriz de teste manual (aceite M7)

Fluxo completo em cada um: boot desbloqueia áudio no gesto → calibração →
música inteira → resultado. HUD (F1): drift < 5ms ao fim; drop = 0.

| Ambiente | Status |
|---|---|
| Chrome desktop (Linux) | ☐ |
| Firefox desktop | ☐ |
| Safari macOS | ☐ |
| Chrome Android (dispositivo real) | ☐ |
| Safari iOS (iPhone real) | ☐ |
| **iPhone + fone Bluetooth (o aceite)** | ☐ — calibrar (offset esperado 100–300ms), jogar, erro mediano na faixa humana |

Extras: trocar de aba no meio (pausa sem cascata de miss); modo avião depois de
carregado (nenhuma request ao unpkg — guard anti-CDN cobre, mas confirmar).

## Notas

- Sem COOP/COEP (não usamos SharedArrayBuffer). Se AudioWorklet com memória
  compartilhada entrar um dia, revisar.
- Música (quando o asset existir): WebM/Opus + fallback AAC (Safari não decodifica
  OGG Vorbis — PESQUISA A11). Não recomprimir áudio no servidor.
- `index.html` no-cache + assets immutable = deploy atômico por hash.
