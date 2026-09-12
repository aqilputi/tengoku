# OKRs — Tengoku (v1)

Formato Google: Objetivos qualitativos e ambiciosos; Key Results mensuráveis,
pontuados de 0.0 a 1.0 ao fim do ciclo (0.7 = bom; 1.0 = excepcional).
Ciclo: um ciclo único para o v1. Grading registrado em [LOG.md](LOG.md).

Documentos relacionados: [SPEC.md](SPEC.md) (especificação técnica) ·
[PLANO.md](PLANO.md) (plano de implementação M0–M7) ·
[PESQUISA.md](PESQUISA.md) (pesquisa de requisitos em outros repositórios) ·
[LOG.md](LOG.md) (log de decisões e progresso).

---

## O1 — Timing confiável: o jogo julga com precisão de ritmo real

*O núcleo de tempo é indistinguível de um jogo de ritmo nativo.*

| KR | Métrica | Alvo | Milestone | Score |
|---|---|---|---|---|
| KR1.1 | Drift acumulado entre relógio de áudio e gameplay em faixa de 3 min | < 5 ms | M1 | — |
| KR1.2 | SFX agendados por segundo sem estalo nem alocação no loop | ≥ 8/s | M2 | — |
| KR1.3 | Erro de julgamento reportado vs. percepção humana (mediana de jogador treinado no HUD) | 20–40 ms | M3 | — |
| KR1.4 | Testes automatizados de timing (TempoMap, AudioClock, Scheduler, Judge) verdes no CI | 100% | M1–M3 | — |
| KR1.5 | Input extra (sem cue) punido como miss explícito | 100% dos casos | M3 | — |

## O2 — Charts são conteúdo: Lua descreve o jogo sem tocar no núcleo

*Qualquer pessoa escreve um chart em Lua sem poder derrubar áudio ou julgamento.*

| KR | Métrica | Alvo | Milestone | Score |
|---|---|---|---|---|
| KR2.1 | Chart do M3 reescrito em Lua produz lista de eventos idêntica (toEqual) | 100% | M4 | — |
| KR2.2 | Globals perigosos (`io`, `os`, `require`, `load`, `dofile`, `loadfile`, `loadstring`, `package`) nulos no sandbox, verificado por teste | 8/8 | M4 | — |
| KR2.3 | Erro em callback Lua não afeta áudio/julgamento (circuit breaker após 5 erros) | 0 crashes | M4 | — |
| KR2.4 | Callbacks Lua fora do caminho crítico: zero chamadas Lua dentro do tick do Scheduler | 0 | M4 | — |

## O3 — Jogável de ponta a ponta por qualquer pessoa, em qualquer dispositivo

*Um jogador novo calibra e termina a música sem instrução externa.*

| KR | Métrica | Alvo | Milestone | Score |
|---|---|---|---|---|
| KR3.1 | Música completa jogável (gabaritando, sem tocar, e esmagando teclas) sem crash/stutter | 3/3 cenários | M5 | — |
| KR3.2 | Teste de corredor: jogadores novos chegam à tela de resultado sem ajuda verbal | 2/2 | M6 | — |
| KR3.3 | Offsets `audio` e `visual` calibrados e persistidos separadamente | 2 offsets | M6 | — |
| KR3.4 | Pause real em `visibilitychange`: zero cascata de miss ao voltar de aba oculta | 0 misses | M5 | — |

## O4 — Deploy estático que funciona no pior caso real

*Build estático servível em qualquer host, jogável até no iPhone com Bluetooth.*

| KR | Métrica | Alvo | Milestone | Score |
|---|---|---|---|---|
| KR4.1 | Matriz de browsers passando o fluxo completo (Chrome, Firefox, Safari desktop + Android e iOS reais) | 5/5 | M7 | — |
| KR4.2 | iPhone + fone Bluetooth: jogável após calibração (offset 100–300 ms absorvido) | passa | M7 | — |
| KR4.3 | Headers de produção corretos (`application/wasm`, `immutable` em assets com hash, `no-cache` no index) verificados via `curl -I` | 3/3 | M7 | — |
| KR4.4 | Zero dependências de runtime além do wasmoon | 1 dep | M0–M7 | — |

---

*Fora de escopo do ciclo (não viram KR): editor de chart, multiplayer, leaderboard, múltiplas músicas/minigames — ver SPEC.md §9.*
