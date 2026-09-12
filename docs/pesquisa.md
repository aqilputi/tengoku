---
type: Research Report
title: Validação de requisitos em repositórios externos
description: Pesquisa em Bemuse, taiko-web, FNF, Tone.js, Chris Wilson e wasmoon que valida a [spec.md](spec.md) e gera os ajustes A1–A12 do [plano.md](plano.md).
resource: https://github.com/aqilputi/tengoku
tags: [pesquisa, timing, wasmoon, benchmarks]
timestamp: 2026-09-11T21:00:00Z
---

# PESQUISA — Validação de requisitos em repositórios externos

Data: 2026-09-11. Três frentes pesquisadas em paralelo (agentes com WebSearch/WebFetch,
modelo Fable): engines de rhythm game no browser, referências canônicas de timing
Web Audio, e estado do wasmoon. Fontes citadas inline em cada parte.

Relacionados: [spec.md](spec.md) · [plano.md](plano.md) · [log.md](log.md)

---

## Sumário executivo — o que a pesquisa muda

A spec foi **validada no núcleo**: relógio mestre = áudio é unânime; janelas ±45/±90 ms
são literalmente o Perfect/Great do StepMania Judge 4 e o Sick/Good do FNF atual;
lookahead + `start(when)` é o padrão canônico; wasmoon confirmado (com precedente
de runtimes sandboxed construídos sobre ele).

**Ajustes adotados** (aplicados como adendo no plano.md):

| # | Ajuste | Evidência |
|---|---|---|
| A1 | Tick do Scheduler em **Web Worker**, não `setInterval` na main thread | Tone.js default, cwilso/metronome atual; imune a throttling e jitter de GC |
| A2 | Lookahead **100 ms** (era 200); SFX dependentes de input tocam imediato (`playNow`), nunca via lookahead; evento que perdeu a janela é dropado | Chris Wilson/Tone.js = 100 ms; Bemuse/taiko-web tocam som de input com delay 0 |
| A3 | **Clock híbrido** para leitura por frame: média móvel (60 amostras) de `performance.now − currentTime` | `currentTime` granular/"em degraus" no Android (Bemuse clock.js; FNF songPositionDelta) |
| A4 | Sanity check de `e.timeStamp` com o guard exato do Google (`> performance.now()` ou `< 0` → fallback) | Bug epoch real em >1% dos usuários (first-input-delay #4) |
| A5 | wasmoon **1.16.0 pinado exato**; `glue.wasm` via `?url` do Vite (**default busca CDN unpkg!**); `functionTimeout` + `setMemoryMax`; sandbox ampliado (`debug`, `string.dump`, `collectgarbage`, `print`) | Inspeção do tarball; issue #76; vetores clássicos de escape Lua |
| A6 | Calibração: **offset negativo permitido** (−200..+500 ms), duas fases (áudio às cegas → visual), silenciar todo o resto durante | taiko-web settings.js; Bemuse #531 (clamp ≥0 é reclamado) e #449 |
| A7 | **Autosound** quando offset calibrado ≥ 10 ms: SFX de resposta agendados no tempo certo em vez de esperar o hit | Bemuse game.ts — essencial para Bluetooth num RH-like |
| A8 | **Warmup** do pipeline de áudio (1 ms de buffer com gain 0 no início) + dedupe de SFX de input em 30 ms | taiko-web soundbuffer.js/controller.js |
| A9 | Zona explícita além de `goodMs`: input fora da última janela de um cue é **input extra** (miss, fiel ao RH) — decisão consciente; os demais jogos ignoram, nós punimos | FNF/Bemuse/taiko ignoram; RH pune — SPEC §2.5 mantida e documentada |
| A10 | `outputLatency`: feature-detect (`'outputLatency' in AudioContext.prototype`), reler durante a sessão; Safari só tem em ≥18.4 | caniuse/MDN Baseline 2025; valor muda com o dispositivo |
| A11 | Música em **WebM/Opus com fallback AAC (.m4a)** — Safari não decodifica OGG Vorbis | Bemuse vendoriza decoder stbvorbis por isso (#509); confirma decisão do PLANO M7 |
| A12 | Lição DMCA: o repo original do taiko-web foi derrubado pela Bandai Namco — reforça SPEC §6 (assets 100% originais) | github/dmca 2023-02-21 |

---
## Parte 1 — Engines de rhythm game no browser

Data da pesquisa: 2026-09-11.

### 1. Bemuse — o mais maduro em TS/JS

Repo: https://github.com/bemusic/bemuse · TypeScript, Web Audio, PIXI.

1. **Sincronização — relógio híbrido**: baseado em `AudioContext.currentTime`, suavizado com `performance.now()`. Motivo documentado em [`bemuse/src/game/clock.js`](https://github.com/bemusic/bemuse/blob/master/bemuse/src/game/clock.js): em alguns browsers (Android) `currentTime` "is not precise" — a cada frame calculam `delta = performance.now()/1000 − currentTime`, mantêm **janela deslizante de 60 amostras** e usam `time = realTime − média(deltas)`. Granularidade do `performance.now`, ancorada no relógio de áudio.
2. **Agendamento**: lookahead curto por frame (~33 ms) em [`player-audio.js`](https://github.com/bemusic/bemuse/blob/master/bemuse/src/game/audio/player-audio.js); dispara via `source.start(context.currentTime + delay)` — sem `setTimeout`. **Keysounds do jogador tocam na hora do hit (delay 0)**; micro-fades de 1 ms em slices; `latencyHint: 'interactive'`.
3. **Julgamento** ([`judgments.ts`](https://github.com/bemusic/bemuse/blob/master/bemuse/src/game/judgments.ts)): Meticulous ±20 / Precise ±50 / Good ±100 / Offbeat ±200 ms. Pareamento em [`player-state.ts`](https://github.com/bemusic/bemuse/blob/master/bemuse/src/game/state/player-state.ts): earliest-first com **regra anti-roubo** (hit que seria Offbeat e não é a nota mais próxima da coluna → ignorado).
4. **Calibração** ([`auto-synchro/`](https://github.com/bemusic/bemuse/blob/master/bemuse/src/auto-synchro/music/index.ts)): 148 BPM, **56 amostras**, **média aparada** (descarta 1/7 de cada extremo), clampada ≥ 0 (sem offset negativo — reclamação em [#531](https://github.com/bemusic/bemuse/issues/531)). Offset único áudio+input: estado/display em `t − A`, áudio em `t`. **Autosound com latência ≥ 10 ms**: keysounds das notas agendados no tempo certo em vez de esperar o hit.
5. **Chart**: BMS/bmson — parsers declarativos, **zero execução de código não confiável**.
6. **Armadilhas documentadas**: `unmuteAudio()` (oscillator + resume em gesto) para iOS; Safari não decodifica OGG → decoder stbvorbis vendorizado ([#509](https://github.com/bemusic/bemuse/issues/509)); `currentTime` impreciso no Android (motivo do clock híbrido); FAQ: "wired headphones work best"; pedido aberto de compensação separada de latência de teclado ([#833](https://github.com/bemusic/bemuse/issues/833)).

### 2. taiko-web

Repo original **removido por DMCA da Bandai Namco em 2023** ([aviso](https://github.com/github/dmca/blob/master/2023/02/2023-02-21-bandai.md)) — lição direta para nossa regra de assets originais (SPEC §6). Código analisado no fork [269Seahorse/Better-taiko-web](https://github.com/269Seahorse/Better-taiko-web).

1. **Sincronização**: relógio de gameplay é `Date.now()` ancorado, com resync em **degraus** quando `|lag| ≥ 50 ms` — usuários percebiam o "snap" (anti-padrão).
2. **Agendamento**: `source.start(when)` direto, sem lookahead clássico. SFX de input tocam **imediatamente no keydown** com dedupe de 30 ms. **`warmup()`**: toca 1 ms de buffer com gain 0 no início para pré-aquecer o pipeline.
3. **Julgamento** ([`gamerules.js`](https://github.com/269Seahorse/Better-taiko-web/blob/master/public/src/js/gamerules.js)): Hard/Oni 良 ±25 / 可 ±75 / 不可 ±108,3 ms (frames de 60 fps). Cursor na primeira nota não julgada; input fora de ±bad é ignorado; `fixNoteStream` pula notas perdidas para casar hit atrasado com nota seguinte compatível.
4. **Calibração dupla e separada**: `latency.audio` (julgamento) e `latency.video` (desenho), **−200 a +500 ms (negativo permitido)**; calibração guiada em **duas fases — áudio (às cegas) e depois vídeo**; 40 amostras, média descartando as 2 primeiras.
5. **Chart**: `.tja`/`.osu` textuais, sem eval (exceto sistema de plugins JS com mero `confirm()` — anti-exemplo).
6. **Armadilhas**: pause em troca de aba (PR #5); `webkitAudioContext` + resume em clique; decoder OGG WASM para Safari; nenhuma issue sobre Bluetooth em ~490 verificadas.

### 3. Friday Night Funkin' — como NÃO fazer (e a correção)

Repo: https://github.com/FunkinCrew/Funkin (Haxe/HaxeFlixel; áudio web via howler.js).

1. **Legacy**: `Conductor.songPosition += elapsed * 1000` (**relógio de frame**) com resync a ±20 ms — origem de anos de bugs de desync/stutter ([#5049](https://github.com/FunkinCrew/Funkin/issues/5049), [#3495](https://github.com/FunkinCrew/Funkin/issues/3495)). **Atual**: fonte de verdade é o tempo do áudio, com `songPositionDelta` interpolando entre atualizações granulares do clock; resync instrumental/vocais a >40 ms.
2. **Input**: [`PreciseInputManager.hx`](https://github.com/FunkinCrew/Funkin/blob/main/source/funkin/input/PreciseInputManager.hx) — timestamps precisos; comentário: sem COOP/COEP o `performance.now()` tem resolução reduzida.
3. **Julgamento** (PBOT1, [`Scoring.hx`](https://raw.githubusercontent.com/FunkinCrew/Funkin/main/source/funkin/play/scoring/Scoring.hx)): **Sick ±45 / Good ±90** / Bad ±135 / miss >160 ms. O diff subtrai latência de input por evento.
4. **Calibração**: offset global −1500..+1500 ms + `audioVisualOffset` separado; offsets por chart (`instrumentalOffset` + `formatOffset` + `globalOffset`).
5. **Chart**: JSON declarativo (v2: metadata + chart, contêiner ZIP). Sem código executável.

### 4. Rhythm Heaven web e Bits & Bops

- Recriações sérias de RH (Heaven Studio Plus, PolyrhythmMania) são **Unity/desktop, não web**. Não existe fan game RH web open-source de referência.
- **Bits & Bops** ([Steam](https://store.steampowered.com/app/1929290/Bits__Bops/)): engine custom com WASAPI exclusivo/ASIO — acesso de baixo nível que o browser **não oferece**. Implicação: no web o teto é Web Audio + calibração; o design RH-like continua válido, a compensação de latência é ainda mais crítica.

### 5. Padrão canônico e toolkits

| Fonte | Ticker | Intervalo | Lookahead |
|---|---|---|---|
| [cwilso/metronome](https://github.com/cwilso/metronome) | **Web Worker** | 25 ms | 100 ms |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Worker (default) | 50 ms | 100 ms |
| [sebpiq/WAAClock](https://github.com/sebpiq/WAAClock) | ScriptProcessor+setTimeout | — | eventos fora da janela são **dropados**, não tocados atrasados |

- **Sonolus** (https://github.com/Sonolus): único projeto web que executa "código" de conteúdo — via **AST interpretada por VM própria determinística e sandboxed** (TS compilado para nodes, nunca eval). Referência se um dia aceitarmos charts de terceiros em escala.
- Feel The Rhythm (PixiJS, janelas StepMania ±22,5/±45/±90/±135/±180); Rhythm Plus (janelas em % da scroll speed — anti-padrão). Não existe pacote npm consolidado de "rhythm game toolkit".

### Validações e divergências vs. nossa spec

**(a) Igual às melhores práticas:** relógio mestre = áudio (unânime nos projetos saudáveis; FNF legacy é o contraexemplo); lookahead com tick 25 ms + `start(when)`; **janelas ±45/±90 batem literalmente com FNF atual e StepMania**; calibração obrigatória; TypeScript.

**(b) Divergências a tratar:**
1. Lookahead 200 ms vs. consenso 100 ms — e regra derivada dos repos: **sons dependentes de input nunca entram no lookahead** (tocam imediato); evento que perdeu a janela é dropado, não tocado atrasado.
2. Só 2 janelas: todos têm 3–4 tiers + zona de input ignorado além da última janela. Definir explicitamente a zona entre `goodMs` e "ignorar". (Nossa punição de input extra é fiel ao RH — manter, mas como decisão consciente e documentada.)
3. Ler `currentTime` cru por frame dá tempo "em degraus" no Android — mitigação comprovada: clock híbrido do Bemuse.
4. Charts em Lua = código não confiável: nenhum projeto web maduro faz; Sonolus compila para VM própria. Para conteúdo first-party, Lua é defensável — formalizar sandbox + atenção a determinismo (random com seed) se replays importarem um dia.
5. Calibração: separar eixos (áudio/vídeo, como taiko-web), permitir offset negativo, estatística robusta, medir taps no relógio de áudio.

**(c) Ideias a roubar:** clock híbrido (Bemuse); autosound ≥10 ms de latência (Bemuse); warmup de pipeline (taiko-web); anti-roubo de nota + fixNoteStream; ticker em Web Worker; compensação via `outputLatency` com feature-detect; calibração em 2 fases às cegas→visual, silenciando o resto; `latencyHint:'interactive'`; dedupe de SFX 30 ms; pause em blur/visibilitychange; offsets por música no chart, separados do offset do jogador.

---

## Parte 2 — Referências canônicas de timing com Web Audio API

Data da pesquisa: 2026-09-11.

### 1. "A Tale of Two Clocks" (Chris Wilson, web.dev)

Fonte: https://web.dev/articles/audio-scheduling

- Padrão canônico: dois relógios — o **relógio de áudio** (`AudioContext.currentTime`, hardware, thread separada, preciso mesmo com a main thread travada) e o **relógio JavaScript** (`setTimeout`/`setInterval`), cujos callbacks "podem facilmente ser desviados em dezenas de milissegundos ou mais por layout, rendering, garbage collection".
- Solução: timer JS impreciso dispara `scheduler()` que agenda com precisão no relógio de áudio: `while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) { scheduleNote(...) }` com `source.start(when)`.
- **Valores recomendados**: *"100ms of 'lookahead' time, with intervals set to 25ms"* — intervalo **25 ms + lookahead 100 ms**. O artigo também demonstra 250 ms de lookahead como cenário válido.
- Racional da sobreposição (lookahead > intervalo): sobreviver a ticks perdidos por GC/layout/rendering.
- Trade-off: lookahead maior = mais robusto, mas eventos agendados ficam "comprometidos" — pause/stop/mudança de tempo demoram até o tamanho da janela.
- MDN reproduz o padrão: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques

### 2. Tone.js — Transport/Clock

Fontes: https://tonejs.github.io/docs/15.0.4/classes/Context.html · https://github.com/Tonejs/Tone.js/wiki/Performance · https://tonejs.github.io/docs/14.7.58/Clock

- Defaults: **`lookAhead: 0.1` s, `updateInterval: 0.03` s, `clockSource: "worker"`, `latencyHint: "interactive"`**.
- **`clockSource: "worker"` (default)**: o tick do scheduler roda num **Web Worker**, não em `setInterval` na main thread — escapa do throttling e do jitter de GC/layout.
- Drift: doc do `Clock` é explícita — o callback não é sample-accurate, mas o **tempo passado como argumento** é; todo agendamento audível usa esse `time`, nunca o instante do callback.
- Latência total de agendamento: `updateInterval + lookAhead`.

### 3. standardized-audio-context e timing-object (chrisguttandin)

Fontes: https://github.com/chrisguttandin/standardized-audio-context · https://github.com/chrisguttandin/timing-object

- Ponyfill que uniformiza a Web Audio API com "expectation tests" (workaround removido quando o browser corrige). Suporte: Chrome 105+, Firefox 113+, Safari 17.3+.
- Workarounds restantes hoje são periféricos (`delayTime`, `AudioListener`, `StereoPannerNode` em versões antigas). **Conclusão: em 2025/2026 o núcleo de timing (`currentTime`, `start(when)`) está estável entre browsers** — não precisamos da lib.
- `timing-object`/`timing-provider`: sincronização de relógio multi-dispositivo via WebRTC (Timing Object spec, W3C). Irrelevante para timing local de um jogador.

### 4. AudioContext.outputLatency — suporte real

Fontes: https://caniuse.com/mdn-api_audiocontext_outputlatency · https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency · https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/ · https://groups.google.com/a/chromium.org/g/blink-dev/c/dTQniJNVVMY

- `baseLatency` cobre só o pipeline interno do browser (~5–12 ms) e **não inclui** hardware/SO/Bluetooth.
- Suporte: **Chrome/Edge 102+, Firefox 70+, Safari 18.4+ (mar/2025)** — Baseline 2025 (newly available), ~94% global. **iOS/macOS < 18.4 não expõe `outputLatency`** — feature-detect obrigatório.
- **Bluetooth**: fones BT ~170–180 ms vs 0–25 ms com fio; codecs de ~40 ms (aptX LL) a 150–250 ms (SBC). A spec exige que o valor se atualize quando o dispositivo muda — **reler periodicamente, não cachear**.
- Telemetria Chromium: médias de outputLatency ~31–46 ms em Windows/Linux/Android/CrOS.

### 5. e.timeStamp vs performance.now()

Fontes: https://developer.chrome.com/blog/high-res-timestamps · https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp · https://github.com/GoogleChromeLabs/first-input-delay/issues/4

- Hoje a spec garante: `Event.timeStamp` é `DOMHighResTimeStamp` relativo a `performance.timeOrigin` — comparável a `performance.now()`, monotônico (Chrome 49+, 2016).
- **Histórico/residual**: o repo `first-input-delay` do Google documentou **valores epoch errôneos em >1% de usuários reais** (Safari 11/11.1 reproduzia em 100% dos casos em algumas máquinas). Mitigação canônica do próprio Google: **`if (e.timeStamp > performance.now() || e.timeStamp < 0) → fallback performance.now()`**.
- Precisão reduzida por anti-fingerprinting: Firefox arredonda para 2 ms; Chrome/Safari ~0,1–1 ms. Desprezível para janelas de ±45 ms.
- Para o mapeamento perf↔áudio, preferir `audioCtx.getOutputTimestamp()` (`{contextTime, performanceTime}`) quando disponível.

### 6. Janelas de julgamento em jogos estabelecidos

| Jogo | Janelas (±ms) | Fonte |
|---|---|---|
| **osu!** (OD variável) | 300: `80−6·OD` → OD5 = ±50 · 100: `140−8·OD` → OD5 = ±100 | https://github.com/ppy/osu-wiki/blob/master/wiki/Beatmap/Overall_difficulty/en.md |
| **Etterna/StepMania Judge 4** | Marvelous ±22,5 · **Perfect ±45 · Great ±90** · Good ±135 · Bad ±180 | https://docs.rs/etterna/latest/src/etterna/judge.rs.html |
| **DDR arcade** | Marvelous ±16,7 (1 frame) · Perfect ±33 · Great ±92 · Good ±142 | https://zenius-i-vanisher.com/v5.2/thread?threadid=9728 |
| **Rhythm Heaven** | Sem tabela canônica: varia **por minigame**, não documentado oficialmente; comunidade raciocina em frames de 60 fps; três categorias efetivas (acerto/"barely"/miss, "barely" conta como miss); Megamix adicionou janela "Ace" mais estrita | https://rhythmheavengroove.live/perfect-guide/ · https://rhythmheaven.fandom.com/wiki/Timing_Display · decomps: https://github.com/conhlee/rhf (Fever), https://github.com/patataofcourse/rhgold (DS) |

Calibração na indústria: tap test é o padrão (tap no beat sonoro mede `áudio + input`; tap em sinal visual mede `vídeo + input`; a diferença dá o offset A/V). ~10 taps é o típico; extremos devem ser ignorados. Fontes: https://rhythmquestgame.com/devlog/10.html · https://exceed7.com/native-audio/rhythm-game-crash-course/index.html

### 7. Throttling de setInterval em aba oculta

Fontes: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 · https://usefulangle.com/post/280/settimeout-setinterval-on-inactive-tab

- **Chrome 88+**: minimal throttling se visível **ou emitiu som nos últimos 30 s**; 1×/s quando oculta; 1×/min (intensive) quando oculta >5 min + cadeia ≥5 timers + sem áudio há 30 s.
- **Exceção crucial**: aba tocando áudio fica isenta do throttling intensivo — durante gameplay o `setInterval(25ms)` tende a sobreviver no Chrome; em pausa/menu silencioso oculto, não.
- Firefox e Safari clampam para ≥1 s em abas ocultas; Safari é o mais agressivo.
- **Timers em Web Workers não sofrem o throttling da main thread** — por isso Tone.js usa worker, e o metrônomo de referência de Chris Wilson evoluiu para tick via Worker (https://github.com/cwilso/metronome).

### Veredito sobre a spec (timing)

| Item da spec | Veredito |
|---|---|
| Relógio mestre = `AudioContext.currentTime` | ✅ Padrão canônico; nenhuma fonte diverge |
| `setInterval` 25 ms | ✅ Número literal de Chris Wilson (Tone.js: 30 ms). **Ajuste recomendado: tick em Web Worker** (padrão Tone.js/metronome atual) — imune a throttling e jitter |
| Lookahead 200 ms | ⚠️ Válido, mas 2× o canônico (100 ms). Sobreposição 8× é super-robusta; custo: pause/mudanças demoram até 200 ms. 100–150 ms basta se responsividade importar |
| `source.start(when)` | ✅ Sem problemas cross-browser remanescentes |
| Input via `e.timeStamp` | ✅ com guard obrigatório: sanity check do first-input-delay (`> performance.now()` ou `< 0` → fallback). Preferir `getOutputTimestamp()` no mapeamento |
| `outputLatency` → `baseLatency` → 0 | ✅ Cadeia correta. Ressalvas: Safari só tem `outputLatency` desde 18.4; `baseLatency` não cobre Bluetooth (calibração manual cobre); reler o valor durante a sessão |
| Janelas ±45/±90 ms | ✅ **Literalmente o Perfect/Great do Judge 4 do Etterna/StepMania**; comparável a osu! OD5 e DDR Great. Tier "Ace" opcional estilo Megamix: ±16–22 ms |
| Calibração: mediana de 16 batidas, descarta 4 | ✅ Acima do padrão da indústria (~10 taps). Tap sonoro mede `áudio+input` — correto para julgamento; offset visual precisa de fase própria com alvo visual |
| Aba oculta | ⚠️ Tratamento explícito necessário: pausar em `visibilitychange` e/ou tick em Worker |

**Síntese**: spec sólida. Quatro ajustes justificados pelas fontes: (1) tick do scheduler em Web Worker; (2) considerar lookahead 100–150 ms; (3) sanity check no `e.timeStamp`; (4) pause em `visibilitychange` + reler `outputLatency` em troca de dispositivo.

---

## Parte 3 — wasmoon: estado do projeto, integração e sandbox

Data da pesquisa: 2026-09-11 (registry npm, API do GitHub, tarballs inspecionados e micro-benchmark local em Node 26).

### 1. O projeto está vivo?

Sim, mas com ritmo de release lento e uma v2 em gestação.

| Fato | Valor |
|---|---|
| Última estável no npm | **1.16.0** (2023-12-08) |
| Pré-release | 2.0.0-next.0 (2026-04-25, tag `next`) |
| Último push no repo | 2026-09-07 (branches `new-apis-2`, `better-async-model`) |
| Último commit na `main` | jan/2025 (ESM-only, fix de leak em threads [#109](https://github.com/ceifa/wasmoon/issues/109) — **não lançado no npm**) |
| Stars / downloads | 697 / ~33k por semana · MIT |

Repo: https://github.com/ceifa/wasmoon. Mantenedor único (ceifa), ativo em 2026 na v2. O leak de threads não lançado é irrelevante para nosso uso (um engine por chart, sem `newThread()` por evento).

### 2. Distribuição do .wasm e integração com Vite

O wasm **não** é inline base64: `dist/glue.wasm` = 271 KB (≈111 KB gzip); `dist/index.js` = 151 KB (≈39 KB gzip). Total ≈ **150 KB gzip**.

**Pegadinha crítica** (verificada no `dist/index.js`): sem URI explícita, o `LuaFactory` em browser busca o wasm em **CDN**: `https://unpkg.com/wasmoon@${version}/dist/glue.wasm` — request runtime externo (quebra offline/CSP; issue [#76](https://github.com/ceifa/wasmoon/issues/76)).

Padrão correto com Vite (não precisa de `vite-plugin-wasm` — o wasm é asset fetchado pelo Emscripten, não módulo ESM):

```ts
import { LuaFactory } from 'wasmoon'
import wasmUrl from 'wasmoon/dist/glue.wasm?url'
const factory = new LuaFactory(wasmUrl)
```

O `dist/index.js` referencia condicionalmente módulos Node (`fs`, `path`, `child_process`...) — Vite normalmente externaliza; plano B: `optimizeDeps.exclude: ['wasmoon']` + ignores do README.

### 3. API real (typings 1.16.0 + teste executado)

```js
const lua = await factory.createEngine({
  openStandardLibs: true,   // default: abre TODA a stdlib
  functionTimeout: undefined, // ms — timeout p/ funções Lua chamadas do JS
})
lua.global.set('play_sfx', (name, gain) => audio.play(name, gain))  // JS → Lua
await lua.doString(chartSource)                                     // avaliação na carga
const onHit = lua.global.get('on_hit')  // referência de função Lua → chamável do JS
onHit('perfect', 3.2)                    // síncrono, tipos convertidos
lua.global.setMemoryMax(64 * 1024 * 1024)
lua.global.close()
```

Conversão tabela↔objeto aninhada funciona (array-part → Array, hash → objeto). Gotchas: `null` injetado avalia como `true` em Lua; callbacks Lua chamados do JS não podem fazer yield ("cannot yield in callbacks from javascript") — não afeta nosso design síncrono.

### 4. Sandboxing

Globals default com `openStandardLibs: true`: **tudo aberto**, incluindo `io`, `os`, `debug`, `package/require`, `load/loadfile/dofile`.

Verificação empírica da fronteira:
- `io` escreve no **MEMFS virtual** do Emscripten — nada chega ao host. Mesmo assim, remover.
- `os.getenv` só vê `environmentVariables` do factory (default vazio).
- **`os.execute` em Node alcança o shim de `child_process`** — prova que `os` deve ser removido e que chart não confiável não deve rodar em Node/SSR sem strip.
- Nenhum CVE/escape browser-side documentado; a memória linear do wasm é a barreira externa.
- Riscos residuais: loop infinito (mitigar com `functionTimeout` + `thread.run({timeout})` na carga → `LuaTimeoutError`) e alocação desenfreada (`setMemoryMax`).

Referências de vetores de escape: https://github.com/kikito/lua-sandbox · https://github.com/Kong/kong-lua-sandbox · https://luau.org/sandbox/

### 5. Performance (medida, Node 26, x86_64)

| Operação | Custo |
|---|---|
| JS → Lua, 2 args escalares + retorno (`on_hit`) | ~3,8 µs/chamada |
| JS → Lua retornando tabela aninhada | ~26 µs/chamada |
| Lua → JS em loop | ~3,2 µs/chamada |

Para dezenas de callbacks/s fora do caminho de áudio: **irrelevante** (4 ordens de magnitude de folga). Benchmark do README: wasmoon ~25× mais rápido que fengari (heapsort 15,3 ms vs 389,9 ms).

### 6. Alternativas

- **fengari** (Lua 5.3 em JS puro): sem asset wasm, ~69 KB gzip, mas ~25× mais lento, API estilo C-stack, manutenção mínima. Só ganharia se o custo do wasm fosse inaceitável.
- **lua-in-js**: dormente (166 downloads/semana, stdlib incompleta) — descartado.
- **Veredito: sem motivo para trocar.**

### 7. Uso real de wasmoon

PIXLISE (NASA/JPL, fork próprio), gly-engine (engine de jogos Lua web), @microverse.ts/runtime-wasm ("per-slot sandboxes" — caso idêntico ao nosso), @markii/lua (runtime sandboxed 5.4, ativo set/2026), @open-rgs/core, e dezenas de dependents de jogos/editores de chart. ~6 forks no npm: ecossistema real, mas o ritmo de release do upstream já forçou forks.

### Veredito (wasmoon)

**CONFIRMADO.** Pinar **`1.16.0` exata (sem `^`)**; não usar `2.0.0-next.0`. Reavaliar na 2.0 estável (wasm menor, async melhor).

Mitigações obrigatórias:
1. `import wasmUrl from 'wasmoon/dist/glue.wasm?url'` + `new LuaFactory(wasmUrl)` — **nunca deixar o default de CDN**; teste offline no CI.
2. `LuaFactory` singleton (instanciar wasm 1×, ~dezenas de ms); um `LuaEngine` por chart; `global.close()` ao descarregar.
3. Sem `newThread()` por evento (leak não lançado).

Checklist de sandbox (prelúdio Lua antes de qualquer chart):

```lua
io = nil
os = nil                    -- ou whitelist { time, clock, date }
load, loadfile, dofile = nil, nil, nil
require, package = nil, nil
debug = nil
string.dump = nil
collectgarbage = nil
print = nil                 -- substituir por logger via lua.global.set
```

Complemento JS: `functionTimeout: 50` no `createEngine`, `thread.run` com timeout na carga, `setMemoryMax(64MB)`, expor à Lua apenas a API do jogo via `global.set`. Seguros: `math`, `string` (sem `dump`), `table`, `utf8`, `coroutine`, `pairs/ipairs/select/type/tostring/tonumber/pcall/xpcall/error/assert/setmetatable`.
