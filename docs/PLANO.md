# Plano de implementação — Tengoku

Plano derivado de `docs/SPEC.md`. Toda decisão da spec é mantida; onde a spec deixa aberto, a decisão está registrada aqui com justificativa. Um engenheiro deve conseguir implementar M0–M7 sem reabrir discussão de arquitetura.

---

## 0. Tipos centrais (definidos uma vez, reusados em todo o plano)

Todos vivem em `src/core/types.ts`, criado no **M1** e estendido nos milestones seguintes. Nenhum outro arquivo redeclara esses tipos.

```ts
// src/core/types.ts

/** Segundos no relógio da MÚSICA (0 = beat 0 do chart, já com offset aplicado). */
export type SongSeconds = number;
/** Segundos no relógio do AudioContext (ctx.currentTime). */
export type CtxSeconds = number;
export type Beats = number;

export interface TempoSegment {
  startBeat: Beats;
  bpm: number;
}

export interface SongMeta {
  audio: string;          // caminho do arquivo, ex. "assets/audio/musica1.ogg"
  title: string;
  offset: number;         // segundos do início do ARQUIVO até o beat 0
  segments: TempoSegment[]; // sempre >= 1; BPM fixo = 1 segmento { startBeat: 0, bpm }
}

export type ChartEvent =
  | { kind: "sfx";    beat: Beats; name: string; variant?: string }
  | { kind: "cue";    beat: Beats; sfx?: string }            // "chamada" (audível/visível)
  | { kind: "expect"; beat: Beats }                          // resposta esperada do jogador
  | { kind: "anim";   beat: Beats; target: string; name: string };

/** Instância runtime de um `expect`, materializada pelo core na carga. */
export interface Cue {
  id: number;
  beat: Beats;
  time: SongSeconds;      // pré-computado via TempoMap na carga (zero conversão no loop)
  state: "pending" | "hit" | "missed";
}

export type Verdict = "perfect" | "good" | "miss";

export interface JudgementResult {
  verdict: Verdict;
  cue: Cue | null;          // null ⇒ input extra (bateu sem cue)
  inputTime: SongSeconds | null; // null ⇒ miss por omissão (cue expirou)
  errorMs: number | null;   // inputTime - cue.time, em ms; null se não pareou
  early: boolean;           // errorMs < 0 (para HUD e feedback "early/late")
}

export interface JudgeWindows {
  perfectMs: number;        // default 45
  goodMs: number;           // default 90
}

export interface InputSample {
  time: SongSeconds;
  source: "key" | "pointer";
  code: string;             // e.code para teclado; "pointer" para toque
}

export interface ChartData {
  song: SongMeta;
  windows: JudgeWindows;
  minigame: string;         // ex. "clappy"
  events: ChartEvent[];     // ordenado por beat, imutável após a carga
}
```

---

## 1. Visão geral e ordem de trabalho

Sequência com dependências duras (→ = bloqueia):

```
M0 (scaffold)
 └→ M1 (AudioClock + TempoMap + HUD)   ← milestone mais importante; não paralelizar nada de core antes dele
     ├→ M2 (Scheduler + pool de SFX)
     │    └→ M3 (Input + Judge)
     │         └→ M5 (minigame visual)
     └→ M4 (Lua) — depende só dos TIPOS do M1/M2 (ChartEvent, SongMeta), não do Judge
M5 + M4 → integração (chart Lua dirigindo o minigame)
M6 (calibração/menus/resultado) — UI pode começar após M3 (calibração usa InputManager + metrônomo do M1)
M7 (build/deploy) — por último, mas o deploy de teste do M0 fica vivo o tempo todo
```

**Paralelizável:**
- **M4 em paralelo com M2/M3**: o `LuaHost` (bootstrap wasmoon, sandbox, DSL do chart) só precisa dos tipos `ChartEvent`/`SongMeta`. A verificação de equivalência do aceite do M4 acontece quando M3 estiver pronto.
- **Produção de assets** (sprites originais, SFX WAV, música OGG) em paralelo com tudo desde M0. Sem assets prontos, M1–M3 usam sons sintetizados via `OscillatorNode` (metrônomo) e retângulos coloridos.
- **M6 (UI DOM)** em paralelo com M5: menus e tela de resultado são DOM puro e não tocam o core.

**Não paralelizável:** nada de M2+ começa antes do aceite do M1. Se o relógio estiver errado, tudo acima dele está errado.

---

## 2. Milestones

### M0 — Scaffold

**Arquivos a criar:**

| Arquivo | Conteúdo |
|---|---|
| `index.html` | canvas full-screen, `<div id="ui">` para DOM overlay, `touch-action: none` no canvas |
| `vite.config.ts` | base config; `assetsInclude: ["**/*.lua"]` (charts entram como asset estático) |
| `tsconfig.json` | `strict: true`, `noUncheckedIndexedAccess: true`, target `ES2022` |
| `package.json` | scripts `dev`, `build`, `preview`, `test` |
| `src/main.ts` | bootstrap: resize do canvas + loop rAF vazio + contador de FPS |
| `src/render/Renderer.ts` | esqueleto (só resize/DPI e loop rAF nesta fase) |
| `.gitignore` | `node_modules`, `dist` |

**Interface (parcial, cresce no M5):**

```ts
// src/render/Renderer.ts
export class Renderer {
  constructor(canvas: HTMLCanvasElement);
  start(): void;                    // inicia rAF
  stop(): void;
  /** Redimensiona backing store por devicePixelRatio (armadilha #8 da spec). */
  resize(): void;
  onFrame(cb: (ctx2d: CanvasRenderingContext2D) => void): void; // temporário até M5
}
```

**Decisões:**
- **DPI:** `canvas.width = clientWidth * devicePixelRatio` + `ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)`; todo código de desenho trabalha em pixels CSS. Justificativa: evita espalhar `dpr` pelo código de render.
- **Deploy de teste desde já:** Cloudflare Pages apontando pro repositório. Justificativa: M7 não pode ser a primeira vez que o build estático roda fora do dev server.

**Aceite (spec):** página em branco com FPS no canto, servida estaticamente.
**Como verificar:** `npm run build && npm run preview` → abrir, ver FPS ~60 estável; redimensionar a janela e confirmar canvas nítido em tela retina (ou DevTools com DPR 2). Confirmar a URL do deploy de teste.

**Riscos:** nenhum relevante. Único cuidado: não deixar o FPS counter alocar strings por frame (atualizar o texto a cada 500ms).

---

### M1 — Relógio e diagnóstico (o milestone que não pode dar errado)

**Arquivos a criar:**
- `src/core/types.ts` (seção 0 deste plano)
- `src/core/TempoMap.ts`
- `src/core/AudioClock.ts`
- `src/core/AssetLoader.ts` (mínimo: `fetch` + `decodeAudioData`)
- `src/debug/diagnostics.ts` (HUD)
- `src/ui/boot.ts` (tela "toque para começar" → `ctx.resume()` — armadilha #1)
- testes: `src/core/TempoMap.test.ts`, `src/core/AudioClock.test.ts`, `test/mocks/MockAudioContext.ts`

**Interfaces:**

```ts
// src/core/TempoMap.ts — puro, sem estado de áudio, 100% testável
export class TempoMap {
  constructor(offset: number, segments: TempoSegment[]);
  beatToTime(b: Beats): SongSeconds;   // inclui offset
  timeToBeat(t: SongSeconds): Beats;
  /** Duração de 1 beat no segmento que contém `b` (para animações). */
  beatDuration(b: Beats): number;
}
```

```ts
// src/core/AudioClock.ts
export class AudioClock {
  constructor(ctx: AudioContext, tempoMap: TempoMap);

  /** Agenda a música em ctx.currentTime + leadIn e fixa as âncoras. */
  start(music: AudioBuffer, leadIn?: number): void;      // leadIn default 0.15
  pause(): Promise<void>;                                 // ctx.suspend()
  resume(): Promise<void>;                                // ctx.resume() + re-âncora perf
  get isRunning(): boolean;

  /** Tempo da música em segundos, já com userAudioOffset e outputLatency. */
  get songTime(): SongSeconds;
  get songBeat(): Beats;
  /** Tempo para o RENDER (usa visualOffset, não audioOffset — spec §2.4). */
  get visualTime(): SongSeconds;
  get visualBeat(): Beats;

  /** Para o Scheduler: converte tempo-de-música em `when` do source.start(). */
  songTimeToCtxTime(t: SongSeconds): CtxSeconds;
  /** Para o InputManager: converte e.timeStamp (ms, base performance.now) em songTime. */
  perfTimeToSongTime(perfMs: number): SongSeconds;

  setUserOffsets(audioOffsetS: number, visualOffsetS: number): void;

  /** Drift medido entre relógio de áudio e performance.now() desde a última âncora. */
  get driftMs(): number;
  /** Latência de saída efetiva: outputLatency ?? baseLatency ?? 0 (spec §2.1). */
  get outputLatencyS(): number;
}
```

```ts
// src/debug/diagnostics.ts
export class DiagnosticsHud {
  constructor(clock: AudioClock);
  draw(ctx2d: CanvasRenderingContext2D): void; // songTime, songBeat, drift, latência, FPS
  toggle(): void;                              // tecla F1
}
```

**Decisões:**
- **Duas âncoras + drift observável:** guardar `audioAnchor: CtxSeconds` e `perfAnchor: DOMHighResTimeStamp` fixadas no mesmo instante do `start()`; `driftMs = (performance.now() - perfAnchor) - (ctx.currentTime - audioAnchor) * 1000`. Justificativa: o aceite do M1 exige medir exatamente isso.
- **Metrônomo do aceite via `OscillatorNode` agendado** (mini-scheduler inline provisório em `main.ts`, descartado no M2). Justificativa: valida o relógio sem depender do M2.
- **Sanidade de `e.timeStamp` no boot** (spec §2.3): em `src/ui/boot.ts`, no primeiro gesto, comparar `e.timeStamp` com `performance.now()`; se divergir > 5s, setar flag global `useUnreliableTimestamps` que faz o InputManager usar `performance.now()` no handler. Justificativa: a spec exige o teste; a flag centraliza o fallback.
- **`outputLatency` lido a cada acesso, não cacheado.** Justificativa: em troca de dispositivo (fone Bluetooth conectado no meio do jogo) o valor muda.

**Aceite (spec):** faixa de 3 min com metrônomo agendado; drift acumulado < 5ms; cliques audíveis alinhados.
**Como verificar:**
1. Automatizado: `npx vitest run` — `TempoMap` (BPM fixo, multi-segmento, ida-e-volta `beatToTime(timeToBeat(t)) ≈ t`), `AudioClock` com `MockAudioContext` (avanço manual de `currentTime`, verificação de `songTime`, âncoras, offsets separados).
2. Manual: tocar faixa de 3 min (pode ser loop de teste), HUD aberto; ao final, `driftMs` < 5. Ouvir os cliques contra a música do início ao fim (fone com fio para eliminar variável Bluetooth nesta fase).

**Riscos e mitigação:**
- *`outputLatency` indisponível/zero em alguns browsers* → cadeia de fallback já na interface (`outputLatencyS`); a calibração do M6 absorve o resto.
- *Confundir os dois relógios (song vs. ctx)* → tipos nominais por alias (`SongSeconds`/`CtxSeconds`) e conversão só dentro do `AudioClock`; nenhum outro módulo lê `ctx.currentTime` diretamente.

---

### M2 — Scheduler de SFX

**Arquivos a criar:**
- `src/core/Scheduler.ts`
- `src/core/SfxPlayer.ts` (novo módulo, não previsto na árvore da spec mas coerente com ela: isola o pool de áudio; fica em `src/core/`)
- Estender `src/core/AssetLoader.ts` (manifesto de SFX, decodificação no boot)
- testes: `src/core/Scheduler.test.ts`

**Interfaces:**

```ts
// src/core/SfxPlayer.ts
export class SfxPlayer {
  constructor(ctx: AudioContext);
  register(name: string, buffer: AudioBuffer): void;   // no boot, nunca no loop
  /** Agenda um disparo sample-accurate. `when` em tempo de contexto. */
  playAt(name: string, when: CtxSeconds, gain?: number): void;
  /** Disparo imediato (feedback de input, calibração). */
  playNow(name: string, gain?: number): void;
}
```

```ts
// src/core/Scheduler.ts
export interface SchedulerOptions {
  intervalMs: number;   // default 25
  lookaheadS: number;   // default 0.2
}
export class Scheduler {
  constructor(clock: AudioClock, sfx: SfxPlayer, opts?: Partial<SchedulerOptions>);
  /** Recebe eventos já ordenados por beat; pré-computa time de cada um na carga. */
  load(events: ChartEvent[], tempoMap: TempoMap): void;
  start(): void;   // setInterval; NUNCA setTimeout para disparar som (spec §8.4)
  stop(): void;
  pause(): void;   // limpa o setInterval; nada a "desagendar" (ver decisão abaixo)
  resume(): void;
  /** Callback para eventos visuais (anim/cue) — enfileirados p/ consumo no rAF. */
  onVisualEvent(cb: (ev: ChartEvent) => void): void;
}
```

**Decisões:**
- **Pool: buffers e GainNodes, não sources.** `AudioBufferSourceNode` é one-shot por design; a "pré-alocação" que importa é (a) todos os `AudioBuffer` decodificados no boot e (b) um pool circular de `GainNode`s já conectados ao destino (default 16). Criar um source por disparo custa microssegundos e não aloca memória de áudio; tentar reciclar sources é impossível pela API. Justificativa: cumpre "sem alocação no loop" no que é mensurável (GC de buffers) sem lutar contra a API.
- **Cursor de leitura, não busca:** o `Scheduler` mantém um índice `nextEventIdx` sobre a lista ordenada; cada tick avança o índice enquanto `event.time < songTime + lookahead`. Justificativa: O(1) amortizado, zero alocação, e `pause` fica trivial.
- **Pause sem desagendamento:** como `pause()` do jogo é `ctx.suspend()` (ver §3.1), tudo que já foi agendado com `start(when)` congela junto com `ctx.currentTime` e retoma alinhado — não é preciso cancelar sources. O `Scheduler` só para o `setInterval` para não avançar o cursor. Justificativa: elimina a classe inteira de bugs de "re-agendar o que foi cancelado".
- **Idempotência por cursor:** um evento agendado nunca é re-agendado porque o cursor só anda para frente; `seek` não existe no v1 (fora de escopo).

**Aceite (spec):** 8 SFX/s sem estalo, sem alocação no loop.
**Como verificar:**
1. Automatizado: teste do `Scheduler` com `MockAudioContext` + `SfxPlayer` espião: dado um chart sintético de 16 beats a 480 BPM (8 disparos/s), avançar o relógio mock em passos de 25ms e assertar que cada evento recebe exatamente **um** `playAt` com `when` correto (±1e-9) e sempre com `when > currentTime` no momento do agendamento.
2. Manual: chart de teste a 8 SFX/s por 30s; ouvir estalos; DevTools → Performance → gravar 10s e confirmar ausência de GC minor no tick do scheduler (aba Memory/allocation sampling).

**Riscos e mitigação:**
- *Tick do `setInterval` atrasar > lookahead (aba com jank)* → lookahead 200ms ≫ intervalo 25ms dá 8× de folga; HUD ganha contador de "ticks atrasados > 100ms".
- *Aba oculta: `setInterval` é throttled para ≥1s* → é exatamente a armadilha #3; tratado no M5/M6 com `visibilitychange` → pause real. Até lá, documentar no HUD.

---

### M3 — Input e julgamento

**Arquivos a criar:**
- `src/core/InputManager.ts`
- `src/core/Judge.ts`
- Estender `src/debug/diagnostics.ts` (histograma/lista de erros em ms por batida)
- testes: `src/core/Judge.test.ts`, `src/core/InputManager.test.ts`

**Interfaces:**

```ts
// src/core/InputManager.ts
export class InputManager {
  constructor(clock: AudioClock, target: HTMLElement);
  attach(): void;    // keydown (ignora e.repeat) + pointerdown (nunca click — spec §8.7)
  detach(): void;
  /** Drena a fila para um array pré-alocado; retorna quantos foram escritos. */
  drain(out: InputSample[]): number;
  clear(): void;     // usado ao resumir de pause (descarta inputs do limbo)
}
```

```ts
// src/core/Judge.ts
export type JudgementCallback = (r: JudgementResult) => void;

export class Judge {
  constructor(clock: AudioClock, windows: JudgeWindows);
  load(cues: Cue[]): void;                 // ordenados por time
  /** Chamado uma vez por frame (rAF): drena input, pareia, expira cues. */
  update(input: InputManager): void;
  onJudgement(cb: JudgementCallback): void; // múltiplos listeners (Lua, HUD, score)
  get stats(): { hits: number; misses: number; meanErrorMs: number; medianErrorMs: number };
  reset(): void;
}
```

**Decisões:**
- **Pareamento: janela ativa + nearest pendente.** Para cada input, considerar apenas cues `pending` com `|input.time - cue.time| <= goodMs`; escolher o de menor erro absoluto; marcá-lo `hit` e emitir veredito por faixa (`perfect` se `|err| <= perfectMs`, senão `good`). Input sem candidato ⇒ `JudgementResult` com `cue: null`, `verdict: "miss"` (input extra — punido, como exige a spec §2.5). Justificativa: nearest-dentro-da-janela evita o bug clássico de nearest-note global (input muito cedo "roubando" o cue seguinte), e o limite `goodMs` faz cada input só enxergar cues realmente ativos.
- **Miss por omissão no `update()`:** cue `pending` com `songTime > cue.time + goodMs` vira `missed` e emite `JudgementResult { cue, inputTime: null, verdict: "miss" }`. Justificativa: o miss precisa ser emitido no momento certo (para animação de erro), não no fim da música.
- **`Judge.update()` roda no rAF, não em `setInterval` próprio.** Justificativa: julgamento usa o timestamp do input (já capturado com precisão no handler), então a latência de *processamento* de até 1 frame não afeta o erro medido; um loop a menos.
- **Julgamento comparando `SongSeconds` contra `SongSeconds`:** o `userOffset` já foi aplicado na conversão do input (`perfTimeToSongTime`), nunca no cue. Justificativa: um único ponto de aplicação do offset elimina dupla contagem.

**Aceite (spec):** erro médio reportado bate com a percepção humana; input extra vira miss.
**Como verificar:**
1. Automatizado (o grosso): testes do `Judge` com relógio mock — input exato ⇒ perfect com `errorMs = 0`; ±44ms ⇒ perfect; ±46ms ⇒ good; ±91ms ⇒ input extra + (depois) miss por omissão; dois inputs para um cue ⇒ 1 hit + 1 extra-miss; dois cues próximos + um input ⇒ pareia com o mais próximo; cue não batido expira como miss no tempo certo.
2. Manual: chart de teste (metrônomo + `expect` a cada beat), jogar 32 beats batendo o melhor possível: HUD mostra erro por batida; mediana esperada de um humano treinado ~±20–40ms. Depois bater fora de propósito e confirmar "EXTRA MISS" no HUD.

**Riscos e mitigação:**
- *`e.timeStamp` não confiável em algum browser* → flag do M1 já faz o fallback para `performance.now()`.
- *Handlers de input alocando objetos* → fila circular pré-alocada de `InputSample` (tamanho 64) dentro do `InputManager`; `drain` copia para array do chamador.

---

### M4 — Lua (wasmoon)

Pode começar em paralelo ao M2/M3 (depende só de `types.ts`).

**Arquivos a criar:**
- `src/lua/LuaHost.ts`
- `src/lua/api.ts`
- `charts/musica1.lua` (o chart do M3 reescrito na DSL da spec §3)
- testes: `src/lua/LuaHost.test.ts` (wasmoon roda em Node, então isto é testável no vitest)

**Interfaces:**

```ts
// src/lua/api.ts — contrato completo do que o Lua enxerga (fase de carga)
export interface ChartDsl {
  song(t: { audio: string; bpm?: number; segments?: TempoSegment[]; offset: number; title: string }): void;
  minigame(name: string): (opts: Record<string, number>) => void; // curried: minigame "clappy" { ... }
  cue(beat: Beats, sfx?: string): void;
  expect(beat: Beats): void;
  anim(beat: Beats, target: string, name: string): void;     // forma declarativa
  on_hit(fn: LuaFunctionRef): void;
  on_miss(fn: LuaFunctionRef): void;
}
// Fase de callback (runtime, chamadas DE DENTRO de on_hit/on_miss):
export interface RuntimeApi {
  play_sfx(name: string, variant?: string): void;  // via SfxPlayer.playNow
  anim(target: string, name: string): void;        // enfileira p/ Renderer
}
```

```ts
// src/lua/LuaHost.ts
export interface ChartLoadResult {
  ok: true;  chart: ChartData;
}
export interface ChartLoadError {
  ok: false; error: string; luaTraceback?: string;
}

export class LuaHost {
  static create(): Promise<LuaHost>;                 // inicializa wasmoon 1×
  loadChart(source: string): Promise<ChartLoadResult | ChartLoadError>;
  /** Invocados pelo Judge. Erro em callback é capturado e logado, nunca propaga. */
  notifyHit(verdict: Verdict, beat: Beats): void;
  notifyMiss(beat: Beats): void;
  dispose(): void;
}
```

**Decisões:**
- **A avaliação do chart escreve direto num builder JS** — `cue`/`expect`/`anim`/`song` são funções JS injetadas no ambiente Lua que fazem `push` num `ChartEvent[]` do lado TS durante a execução do script. Ao final, o host **ordena por beat** e valida. Não há tabela Lua gigante convertida no fim. Justificativa: evita marshalling profundo de tabelas (custo e casos-borda do wasmoon) e dá mensagens de erro com contexto imediato ("cue com beat negativo na chamada N").
- **Validação pós-carga obrigatória:** `song{}` chamado exatamente 1×; beats finitos e ≥ 0; `bpm > 0`; lista ordenada; caminho de áudio dentro de `assets/`. Falha ⇒ `ChartLoadError`, tela de erro amigável, jogo não inicia.
- **Sandbox por remoção explícita:** após criar o estado, `lua.global.set("io", null)` etc. para `io, os, package, require, load, loadstring, dofile, loadfile, collectgarbage` — e teste automatizado que asserta que cada um é `nil` dentro do Lua. Justificativa: a spec lista o sandbox como requisito; o teste impede regressão.
- **Callbacks Lua guardados como referência de função** (wasmoon suporta passar `LuaFunction` para JS). `notifyHit` chama dentro de `try/catch`; na primeira exceção, loga com traceback, incrementa contador no HUD e, após 5 erros, **desativa o callback** (o jogo segue sem reações Lua). Justificativa: a regra de ouro da spec — um chart quebrado não pode derrubar áudio nem julgamento.
- **`bpm = N` no `song{}` é açúcar para `segments = [{startBeat: 0, bpm: N}]`.** Justificativa: mantém a DSL da spec §3 e o TempoMap multi-segmento do §2.2 sem duplicar caminho de código.

**Aceite (spec):** o chart do M3 reescrito em Lua produz exatamente a mesma lista de eventos.
**Como verificar:** teste automatizado no vitest (wasmoon roda em Node): carregar `charts/musica1.lua`, comparar `chart.events` com o array TS hardcoded do M3 via `expect(...).toEqual(...)`. Mais: testes de sandbox (globais perigosos são nil), de erro de sintaxe (retorna `ChartLoadError` com traceback), de callback que lança (não propaga; desativa após 5).

**Riscos e mitigação:**
- *Carregamento do `.wasm` do wasmoon no build do Vite* → wasmoon embute o wasm via base64/inline nas versões atuais; smoke test no `npm run preview` do M4 (não só no dev server). Se o bundle inline pesar demais, mover para `initWasm` com asset explícito.
- *Custo de chamada JS↔Lua nos callbacks* → irrelevante por design: callbacks só em eventos julgados (poucos por segundo), nunca no caminho do Scheduler. Nada a fazer além de manter a regra.

---

### M5 — Minigame visual

**Arquivos a criar:**
- `src/render/minigames/clappy.ts`
- Estender `src/render/Renderer.ts` (cena, sprites, câmera fixa)
- `src/render/Sprite.ts` (novo, coerente com a árvore: folha de sprites + animação por beat)
- Estender `src/core/AssetLoader.ts` (imagens)
- `src/main.ts` vira orquestrador real: boot → carrega chart Lua → monta clock/scheduler/judge/renderer → play

**Interfaces:**

```ts
// src/render/Renderer.ts (forma final)
export interface MinigameScene {
  init(assets: AssetLoader): void;
  /** Só leitura de relógio; usa visualBeat/visualTime (offset visual, não de áudio). */
  draw(g: CanvasRenderingContext2D, visualBeat: Beats, visualTime: SongSeconds): void;
  onJudgement(r: JudgementResult): void;   // feedback de acerto/erro
  onChartEvent(ev: ChartEvent): void;      // cues/anims vindos do Scheduler
}
export class Renderer {
  constructor(canvas: HTMLCanvasElement, clock: AudioClock);
  setScene(s: MinigameScene): void;
  start(): void;
  stop(): void;
}
```

**Decisões:**
- **Animações são funções puras de beat** (`pose = f(visualBeat)`), não máquinas de estado com timers, exceto reações momentâneas a julgamento (que guardam `startBeat` e interpolam a partir dele). Justificativa: rAF pode pular frames sem dessincronizar nada — princípio central da spec.
- **`visibilitychange` ⇒ pause real** (armadilha #3) entra aqui, porque é aqui que o jogo vira "jogável de ponta a ponta": `document.hidden` ⇒ `game.pause()` (§3.1) + overlay "pausado, toque para continuar".
- **Partículas/feedback pré-alocados** em arrays fixos (pool de 64), índice circular. Justificativa: armadilha #5.

**Aceite (spec):** jogável do começo ao fim da música.
**Como verificar:** manual — jogar a música inteira 3×: (a) tentando gabaritar, (b) sem tocar em nada (todos os expects viram miss, jogo não trava), (c) esmagando teclas (só extra-miss, sem crash, sem stutter). Trocar de aba no meio e voltar: jogo pausado, sem cascata de miss.

**Riscos e mitigação:**
- *Stutter por GC de render* → allocation profiling de 30s no DevTools; a regra "zero `new` dentro de `draw`" entra no code review.
- *Sprites atrasados visualmente em relação ao áudio* → é para isso que existe `visualOffset`; expor slider temporário no HUD para ajuste empírico antes da calibração formal do M6.

---

### M6 — Calibração, menus, resultado

**Arquivos a criar:**
- `src/ui/calibration.ts`
- `src/ui/menu.ts`
- `src/ui/results.ts`
- `src/core/Settings.ts` (novo: leitura/escrita de `localStorage`, versão do schema)

**Interfaces:**

```ts
// src/core/Settings.ts
export interface UserSettings {
  version: 1;
  audioOffsetS: number;   // default 0
  visualOffsetS: number;  // default 0
  calibratedAt: string | null; // ISO date; null ⇒ força calibração antes de jogar
}
export const Settings: {
  load(): UserSettings;
  save(s: UserSettings): void;
};

// src/ui/calibration.ts
export class CalibrationScreen {
  constructor(clock: AudioClock, sfx: SfxPlayer, input: InputManager);
  /** Metrônomo, 16 batidas, descarta 4, mediana ⇒ audioOffset (spec §2.4). */
  run(): Promise<{ audioOffsetS: number }>;
}

// src/ui/results.ts
export interface GameResult {
  perfects: number; goods: number; misses: number; extras: number;
  medianErrorMs: number;
}
export type Rank = "try_again" | "ok" | "superb"; // faixas, não nota numérica (spec M6)
export function computeRank(r: GameResult, totalCues: number): Rank;
export function showResults(r: GameResult, rank: Rank, onReplay: () => void): void;
```

**Decisões:**
- **Fluxo obrigatório:** boot → menu → (se `calibratedAt === null`) calibração forçada → jogo → resultado. Recalibrar sempre acessível no menu. Justificativa: spec §2.4 diz "obrigatória, não escondida".
- **Faixas de rank:** `superb` se misses+extras == 0 e ≥ 60% perfect; `ok` se ≥ 70% dos cues acertados; senão `try_again`. Justificativa: precisa de um corte concreto para implementar; valores no estilo da série, triviais de ajustar depois (constantes num só lugar).
- **`visualOffset` na calibração v1 = 0 por default com ajuste manual (setas ±5ms numa tela de teste visual simples).** Justificativa: calibração audiovisual automática é pesquisa; manual resolve o v1 sem bloquear.
- **UI em DOM sobre o canvas** (`<div id="ui">` do M0), sem framework (spec). Telas são módulos que montam/desmontam seu próprio subtree.

**Aceite (spec):** jogador novo calibra e joga sem instrução externa.
**Como verificar:** teste de corredor — 2 pessoas que nunca viram o projeto, `localStorage` limpo, sem ajuda verbal; ambas devem chegar à tela de resultado. Automatizado: `computeRank` e round-trip de `Settings` (incluindo `localStorage` corrompido ⇒ defaults) no vitest com jsdom.

**Riscos e mitigação:**
- *Mediana da calibração contaminada por batidas perdidas* → descartar amostras com |erro| > 250ms além das 4 primeiras; se sobrarem < 8 amostras válidas, repetir a rodada com mensagem.

---

### M7 — Build e deploy

**Arquivos a criar/modificar:**
- `vite.config.ts` (hash de assets — default do Vite — e revisão do bundle wasmoon)
- `public/_headers` (Cloudflare Pages) **e** `deploy/nginx.conf.example` — os dois alvos da spec §7
- `docs/DEPLOY.md` (checklist de headers e MIME)

**Decisões:**
- **Headers:** `Cache-Control: public, max-age=31536000, immutable` para `/assets/*` com hash; `Cache-Control: no-cache` para `index.html`; MIME `application/wasm`; compressão brotli/gzip para `.js`/`.wasm`; **sem** COOP/COEP (spec §7).
- **Matriz de teste mínima:** Chrome + Firefox no desktop Linux, Safari no macOS/iPhone real, Chrome no Android real; iPhone com fone Bluetooth é o caso do aceite.

**Aceite (spec):** funciona no iPhone com fone Bluetooth depois de calibrar.
**Como verificar:** procedimento manual documentado em `docs/DEPLOY.md`: build → deploy → em cada dispositivo da matriz: boot desbloqueia áudio no gesto, calibração completa, música inteira jogável, resultado exibido. No iPhone+Bluetooth: calibrar (offset esperado 100–300ms), jogar e conferir que o erro mediano no HUD fica na faixa humana normal. Verificar headers com `curl -I` no `.wasm`, num `.js` com hash e no `index.html`.

**Riscos e mitigação:**
- *Safari iOS: `currentTime` parado antes do unlock* → o boot do M1 já só fixa âncoras **depois** do `resume()` resolvido; teste explícito no iPhone.
- *`decodeAudioData` de OGG Vorbis não suportado no Safari* ← risco real e conhecido: **decidir por WebM/Opus com fallback AAC (.m4a)** para a música; o `AssetLoader` tenta a lista de fontes em ordem. Verificar cedo (spike no M1 num Mac/iPhone), não no M7.

---

## 3. Pontos críticos

### 3.1 Ciclo de vida do AudioContext e pause/resume

Estados e transições (implementado no `AudioClock` + `main.ts`):

1. **Boot:** criar `AudioContext` (nasce `suspended`). Tela "toque para começar". No gesto: `await ctx.resume()`; rodar o teste de sanidade de `e.timeStamp`; só então carregar/decodificar (decodificar antes do resume é permitido, mas âncoras nunca antes).
2. **Start da música:** `src.start(ctx.currentTime + 0.15)`; fixar `audioAnchor = startAt` e `perfAnchor = performance.now() + 150` no mesmo tick.
3. **Pause do jogo = `ctx.suspend()`.** `ctx.currentTime` congela ⇒ `songTime` congela sozinho, sources já agendados congelam e retomam alinhados, âncora de áudio permanece válida. Nada é cancelado ou re-agendado. Scheduler para o `setInterval`; Judge ignora `update`; InputManager `clear()`.
4. **Resume = `await ctx.resume()`** e, no `.then`, **re-ancorar apenas o par perf↔ctx**: `perfAnchor = performance.now(); perfAnchorCtxTime = ctx.currentTime` (necessário porque `performance.now()` continuou andando durante o suspend — sem isso, `perfTimeToSongTime` de todo input pós-resume vem errado). `audioAnchor` não muda.
5. **`visibilitychange` com `document.hidden` ⇒ transição 3** automaticamente (armadilha #3).
6. **Drift contínuo:** o HUD mede `driftMs` desde a última âncora perf↔ctx; se em algum browser o drift crescer sem bound, a mitigação é re-ancorar o par perf↔ctx a cada 30s (só afeta conversão de input, nunca o agendamento de áudio, que vive 100% no relógio ctx).

Consequência de design importante: **input usa o relógio perf, áudio usa o relógio ctx, e o único lugar que traduz entre eles é o `AudioClock`** — com âncora renovável. Agendamento (`Scheduler`) nunca toca em `performance.now()`.

### 3.2 Contrato exato Lua ↔ core

**Fase 1 — carga (uma vez, antes do play):**
- Entrada: string do `.lua` (fetch do `charts/musica1.lua`).
- O `LuaHost` cria o estado, aplica o sandbox, injeta a DSL (§M4) e executa o script.
- Saída: `ChartLoadResult { chart: ChartData }` — `events` ordenados, `song` validado, `windows` mescladas com defaults (45/90ms) — **ou** `ChartLoadError { error, luaTraceback }`. Erro na carga é fatal-amigável: tela de erro, jogo não inicia, nenhum estado parcial.
- O core então: `TempoMap` a partir de `song`, `Cue[]` materializados dos eventos `expect` (com `time` pré-computado), `Scheduler.load(events)`, `Judge.load(cues)`.

**Fase 2 — runtime (só via Judge/eventos julgados):**
- `Judge` emite `JudgementResult` → um adapter fino em `main.ts` chama `luaHost.notifyHit(verdict, beat)` ou `notifyMiss(beat)`.
- Dentro dos callbacks Lua, só a `RuntimeApi` está disponível (`play_sfx`, `anim`); `play_sfx` chama `SfxPlayer.playNow` (imediato — é reação, não agendamento); `anim` enfileira para o `Renderer` consumir no próximo frame.
- **Erro em callback:** capturado no `LuaHost`, logado com traceback, contado; após 5 erros o callback é desativado e o HUD mostra "chart callbacks disabled". Áudio, scheduler e julgamento seguem intactos — invariante inegociável da spec.
- Lua **nunca** é invocada de dentro do tick do `Scheduler` nem de handlers de input. Ponto único de entrada: o dispatch de julgamentos, no rAF.

### 3.3 Estratégia de testes de timing

**Testável no vitest (com `test/mocks/MockAudioContext.ts` — objeto com `currentTime` mutável, `createBufferSource`/`createGain` espiões, `suspend`/`resume` que congelam o tempo):**
- `TempoMap`: conversões, multi-segmento, inversibilidade — puro, sem mock.
- `AudioClock`: âncoras, `songTime` sob offsets, congelamento em suspend, re-âncora perf no resume (mock de `performance.now` via `vi.spyOn`).
- `Scheduler`: cada evento agendado exatamente 1×, `when` correto, `when > currentTime`, comportamento sob ticks atrasados (avançar o mock 300ms de uma vez e verificar que nada foi pulado).
- `Judge`: toda a matriz de pareamento e expiração (lista no M3).
- `LuaHost`: equivalência de chart, sandbox, erros de carga e de callback (wasmoon roda em Node).
- `computeRank`, `Settings`, mediana da calibração (função pura extraída: `medianOffset(samples: number[]): number`).

**Só manual (relógio real, ouvido, dispositivos):**
- Drift real de 3 min (aceite M1) — depende do hardware de áudio.
- Estalos/glitches a 8 SFX/s (aceite M2) — DevTools + ouvido.
- "Erro reportado bate com a percepção" (aceite M3) — humano no loop.
- Latência Bluetooth, autoplay unlock no iOS, throttling de aba oculta (M7).
- Regra prática: **tudo que é aritmética de tempo é testado por máquina; tudo que envolve hardware de áudio/entrada real é procedimento manual documentado no milestone.**

### 3.4 Versões de dependências (razoáveis em 2026)

| Pacote | Versão | Nota |
|---|---|---|
| `typescript` | `~5.9` | pin de minor; sem features experimentais |
| `vite` | `^7.1` | build estático default já cobre a spec §7 |
| `vitest` | `^3.2` | ambiente `node` para core/lua; `jsdom` só nos testes de `ui/` |
| `wasmoon` | `^1.16` | Lua 5.4; conferir no lockfile que o `.wasm` embutido bundleia no `vite build` |
| `jsdom` (dev) | `^26` | apenas testes de UI/Settings |

Zero dependências de runtime além do `wasmoon`. Pin via `package-lock.json` commitado.

---

## 4. Definição de pronto do v1 (checklist final)

- [ ] `npm run build` gera `dist/` estático que funciona via `npm run preview` e no host real (Cloudflare Pages **ou** nginx com `deploy/nginx.conf.example`).
- [ ] Aceites M0–M7 todos verificados pelos procedimentos descritos acima (drift < 5ms/3min; 8 SFX/s limpos; input extra pune; chart Lua ≡ chart TS; música jogável de ponta a ponta; calibração usável por novato; iPhone + Bluetooth OK).
- [ ] `npx vitest run` verde: TempoMap, AudioClock, Scheduler, Judge, LuaHost (equivalência + sandbox + erro em callback), rank/settings/mediana.
- [ ] Sandbox Lua verificado por teste: `io`, `os`, `package`, `require`, `load`, `dofile`, `loadfile`, `loadstring` são `nil` no ambiente do chart.
- [ ] Chart Lua com erro (sintaxe e runtime de callback) degrada com mensagem amigável; áudio e julgamento nunca são afetados por erro de Lua.
- [ ] Pause por `visibilitychange` e por ação do jogador: sem cascata de miss ao voltar, sem dessincronia audível pós-resume.
- [ ] `audioOffset` e `visualOffset` persistidos separadamente em `localStorage`; recalibração acessível pelo menu.
- [ ] Sem alocação nos caminhos quentes (tick do Scheduler, handlers de input, `draw`): allocation profiling de 30s sem GC atribuível a eles.
- [ ] Headers de produção conferidos com `curl -I`: `application/wasm`, `immutable` em assets com hash, `no-cache` no `index.html`, compressão em `.js`/`.wasm`.
- [ ] Todos os assets (sprites, SFX, música) originais — nada da Nintendo (spec §6).
- [ ] Fora de escopo respeitado: nenhum código de editor, multiplayer, leaderboard ou multi-música — mas `ChartData`/`MinigameScene` são interfaces que os permitem depois.
