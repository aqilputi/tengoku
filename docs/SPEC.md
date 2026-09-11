# Engine de jogo de ritmo para browser — plano de implementação

> Documento de especificação para ser entregue ao Claude Code.
> Objetivo: uma engine web, estática, que roda **uma música** num minigame estilo
> call-and-response (Rhythm Heaven), com charts escritos em Lua.

---

## 0. Resumo da decisão técnica

O núcleo sensível a tempo é **JavaScript/TypeScript sobre Web Audio API**.
Lua entra como **camada de script declarativa** (chart + comportamento do minigame),
executada por `wasmoon` (Lua 5.4 em WebAssembly).

A regra que organiza todo o resto: **o relógio mestre é o relógio de áudio**.
Nada de lógica de jogo depende de `deltaTime` de frame. Tudo é função de `songTime`.

Consequência prática: Lua **nunca** é chamada dentro do caminho crítico de agendamento
de áudio. Lua produz dados na carga e reage a eventos já julgados pelo núcleo.

### Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Build | Vite + TypeScript | build estático, HMR, zero config de servidor |
| Áudio | Web Audio API nativa | único jeito de ter agendamento sample-accurate |
| Script | `wasmoon` (Lua 5.4 → wasm) | VM real, bindings JS, projeto ativo |
| Render | Canvas 2D (PixiJS só se necessário) | um minigame não justifica WebGL ainda |
| Deploy | build estático → nginx ou Cloudflare Pages | sem backend |

Sem framework de UI. Sem React. Menus são DOM simples.

---

## 1. Arquitetura

```
┌─────────────────────────────────────────────┐
│  Lua (wasmoon)                              │
│  chart.lua        → declara eventos/beats   │
│  minigame.lua     → callbacks de reação     │
└──────────────┬──────────────────────────────┘
               │ só na carga + callbacks de evento
┌──────────────▼──────────────────────────────┐
│  Core (TS) — caminho crítico                │
│  AudioClock  Scheduler  Input  Judge        │
└──────────────┬──────────────────────────────┘
               │ estado + eventos julgados
┌──────────────▼──────────────────────────────┐
│  Render (TS) — Canvas 2D, rAF               │
└─────────────────────────────────────────────┘
```

### Módulos

**`AudioClock`** — dona do tempo. Expõe:
- `songTime` em segundos e `songBeat` em beats
- conversão `beatToTime(b)` / `timeToBeat(t)`
- correção de latência de saída e offset do jogador

**`Scheduler`** — loop de lookahead. A cada ~25ms (via `setInterval`), varre os
eventos que caem nos próximos ~200ms e agenda cada um com `source.start(when)`.
Nunca usa `setTimeout` para disparar som.

**`InputManager`** — captura `keydown` / `pointerdown`, converte o timestamp do
evento para tempo de áudio, empurra numa fila. Não julga nada.

**`Judge`** — consome a fila de input contra os cues ativos, aplica janelas,
emite `hit` / `miss` / `early` / `late`. É quem chama Lua.

**`Renderer`** — `requestAnimationFrame`, lê `AudioClock.songTime`, desenha.
Pode atrasar ou perder frames sem afetar o julgamento.

**`LuaHost`** — inicializa wasmoon, carrega o chart, expõe a API, sandboxa.

---

## 2. O núcleo de timing (a parte que não pode dar errado)

### 2.1 Relógio

```ts
// no start
const src = ctx.createBufferSource();
src.buffer = musicBuffer;
const startAt = ctx.currentTime + 0.15;   // margem pro agendamento
src.start(startAt);
this.audioAnchor = startAt;
this.perfAnchor  = performance.now();

// durante o jogo
get songTime() {
  return ctx.currentTime - this.audioAnchor - this.userOffset;
}
```

Correção de saída: somar `ctx.outputLatency` (quando disponível; cair para
`ctx.baseLatency`, e para `0` se nenhum existir) na diferença entre o que foi
**agendado** e o que foi **ouvido**. Isso importa em Bluetooth, onde a latência
passa de 100ms.

### 2.2 Beats, não segundos

```
time = offset + beat * (60 / bpm)
```

Mesmo que a música tenha BPM fixo, implementar como **lista de segmentos de tempo**
(`{ startBeat, bpm }`) desde o começo. Reescrever isso depois é caro.

### 2.3 Timestamp do input

```ts
onKeyDown(e: KeyboardEvent) {
  // e.timeStamp é DOMHighResTimeStamp, mesma base de performance.now()
  const t = (e.timeStamp - this.perfAnchor) / 1000 + this.audioAnchor;
  this.queue.push({ time: t, key: e.code });
}
```

**Validar** `e.timeStamp` na inicialização: se vier num valor absurdo (alguns
navegadores antigos usam epoch Unix), cair para `performance.now()`. Escrever
um teste de sanidade que roda uma vez no boot.

Ignorar `e.repeat === true`.

### 2.4 Calibração

Tela obrigatória antes de jogar (não opcional, não escondida em settings):
metrônomo simples, jogador bate 16 beats, descarta os 4 primeiros, tira a
**mediana** dos erros → `userOffset`. Persistir em `localStorage`.

Manter **dois offsets separados**: `audioOffset` (julgamento) e `visualOffset`
(quando a animação aparece). Não são a mesma coisa e misturá-los é um bug
que só aparece quando você já tem o jogo pronto.

### 2.5 Janelas de julgamento

Valores iniciais, ajustáveis por chart:

| Veredito | Janela |
|---|---|
| Perfeito | ±45ms |
| Bom | ±90ms |
| Erro (miss) | fora, ou input sem cue |

Rhythm Heaven pune input extra tanto quanto input ausente — o `Judge` precisa
tratar "bateu quando não tinha cue" como falha explícita.

---

## 3. Formato do chart (Lua)

API declarativa, avaliada uma vez na carga. O resultado é uma lista de eventos
ordenada que vai pro `Scheduler`.

```lua
song {
  audio  = "assets/musica.ogg",
  bpm    = 124,
  offset = 0.312,          -- segundos até o beat 0
  title  = "...",
}

minigame "clappy" {
  janela_perfeito = 0.045,
}

-- chamada nos beats 4,5,6 e resposta no 7
for i = 0, 7 do
  local b = 4 + i * 8
  cue(b);     cue(b + 1);  cue(b + 2)
  expect(b + 4); expect(b + 5); expect(b + 6)
end

on_hit(function(judgement, beat)
  play_sfx("clap", judgement == "perfect" and "clean" or "weak")
  anim("personagem", "bater")
end)

on_miss(function(beat)
  anim("personagem", "errar")
end)
```

**Sandbox:** remover `io`, `os`, `package`, `require`, `load`, `dofile` do
ambiente Lua. O chart é conteúdo, não código confiável — e você vai querer
aceitar chart de terceiros mais tarde.

**Regra de ouro:** callbacks Lua só rodam em eventos já julgados, nunca dentro
do loop do `Scheduler`. Se um callback travar por 10ms, o áudio não pode ser
afetado.

---

## 4. Estrutura de pastas

```
/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── core/
│   │   ├── AudioClock.ts
│   │   ├── Scheduler.ts
│   │   ├── InputManager.ts
│   │   ├── Judge.ts
│   │   ├── AssetLoader.ts
│   │   └── TempoMap.ts
│   ├── lua/
│   │   ├── LuaHost.ts        -- bootstrap wasmoon + sandbox
│   │   └── api.ts            -- funções expostas ao Lua
│   ├── render/
│   │   ├── Renderer.ts
│   │   └── minigames/clappy.ts
│   ├── ui/
│   │   ├── calibration.ts
│   │   ├── menu.ts
│   │   └── results.ts
│   └── debug/
│       └── diagnostics.ts    -- HUD de drift, latência, erro médio
├── charts/
│   └── musica1.lua
└── assets/
    ├── audio/
    └── sprites/
```

---

## 5. Milestones

Cada um termina em algo verificável. Não avançar sem o critério de aceite.

**M0 — Scaffold**
Vite + TS, canvas em tela cheia responsivo, loop rAF vazio, deploy de teste.
*Aceite:* página em branco com FPS no canto, servida estaticamente.

**M1 — Relógio e diagnóstico** ← *o milestone mais importante*
`AudioClock`, `TempoMap`, HUD de debug mostrando `songTime`, `songBeat` e o
**drift** entre o relógio de áudio e `performance.now()`.
*Aceite:* tocar uma faixa de 3 minutos com clique de metrônomo agendado; drift
acumulado < 5ms no fim; os cliques permanecem audivelmente alinhados com a música.

**M2 — Scheduler de SFX**
Lookahead de 200ms, agendamento com `start(when)`, pool de buffers pré-decodificados.
*Aceite:* 8 SFX por segundo sem estalo, sem alocação no loop.

**M3 — Input e julgamento**
`InputManager` + `Judge` + HUD mostrando erro em ms de cada batida.
*Aceite:* erro médio reportado bate com o que um humano percebe; input extra vira miss.

**M4 — Lua**
wasmoon, `LuaHost`, sandbox, parser do chart, API do capítulo 3.
*Aceite:* o chart do M3 reescrito em Lua produz exatamente a mesma lista de eventos.

**M5 — Minigame visual**
Um minigame completo: sprites, animações ancoradas em beat, feedback de acerto/erro.
*Aceite:* jogável do começo ao fim da música.

**M6 — Calibração, menus, resultado**
Tela de calibração com persistência, menu inicial, tela de score no estilo da série
(faixa de avaliação, não nota numérica).
*Aceite:* jogador novo consegue calibrar e jogar sem instrução externa.

**M7 — Build e deploy**
Build de produção, headers, teste em Chrome/Firefox/Safari e em Android/iOS reais.
*Aceite:* funciona no iPhone com fone Bluetooth depois de calibrar.

---

## 6. Assets

**Música:** OGG Vorbis ou WebM/Opus. Atenção à memória: `decodeAudioData` mantém
PCM float na RAM — ~42MB para 2 minutos em estéreo a 44.1kHz. Aceitável, mas é o
maior consumo do jogo. Não usar MP3 com bitrate variável (o padding do encoder
desloca o início).

**SFX:** WAV curtos, decodificados uma vez no boot, reutilizados do pool.

**Sprites:** originais. Não usar assets da Nintendo — você é quem hospeda, então
o DMCA chega no seu domínio e no seu registrar, não num intermediário. A mecânica
não é protegível; os sprites e SFX são.

---

## 7. Deploy

Build estático do Vite → qualquer coisa que sirva arquivo.

- Não usa `SharedArrayBuffer`, então **não precisa** de COOP/COEP. Se algum dia
  entrar `AudioWorklet` com memória compartilhada, aí precisa.
- MIME correto para `.wasm` (`application/wasm`) — nginx antigo não tem no
  `mime.types`.
- `Cache-Control: immutable` nos assets com hash; `no-cache` no `index.html`.
- Habilitar compressão para `.wasm` e `.js`; áudio já é comprimido, não recomprimir.

---

## 8. Armadilhas conhecidas

Lista para o Claude Code tratar explicitamente, não descobrir no caminho:

1. **Autoplay policy** — `AudioContext` nasce suspenso. Só `resume()` dentro de
   um gesto do usuário. Tela de "toque para começar" obrigatória.
2. **Safari/iOS** — `currentTime` só avança após o unlock; latência de saída alta;
   Bluetooth adiciona 100–300ms. Calibração resolve, ausência dela quebra o jogo.
3. **Aba oculta** — `requestAnimationFrame` congela mas o áudio continua. Detectar
   `visibilitychange` e pausar de verdade, senão o jogador volta e leva miss em cascata.
4. **`setTimeout` para áudio** — nunca. Só lookahead + `start(when)`.
5. **Alocação no loop** — pré-alocar tudo (buffers, objetos de evento, partículas).
   GC no meio de uma seção rápida aparece como stutter visual.
6. **`e.repeat`** no teclado — filtrar.
7. **Mobile** — `pointerdown`, não `click` (o `click` espera o release).
   `touch-action: none` no canvas pra matar o delay de 300ms e o scroll.
8. **Resize e DPI** — redimensionar o canvas por `devicePixelRatio`, não por CSS,
   senão fica borrado em tela retina.
9. **Início da música** — `offset` do chart é medido no arquivo real, não assumido
   como zero. Construir uma ferramentinha de debug pra achar esse valor.

---

## 9. Fora de escopo (v1)

Editor de chart visual, multiplayer, leaderboard, múltiplas músicas, múltiplos
minigames. A estrutura deve permitir tudo isso depois, mas nada disso entra agora.
