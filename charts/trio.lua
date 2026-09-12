-- Minigame "trio": reprodução MECÂNICA do call-and-response de fila
-- (estilo The Clappy Trio do Rhythm Tengoku): dois da fila batem palma em
-- sequência e o jogador — o terceiro — fecha mantendo o intervalo exato.
-- Padrões: normal (1 beat entre palmas) e rápido (meio beat).
-- Assets e personagens são originais; só a mecânica é referenciada.

song({
  audio = "assets/audio/trio.webm",
  bpm = 118,
  offset = 0,
  title = "Trio das Palmas",
})

minigame("trio")({
  janela_perfeito = 0.045,
  janela_bom = 0.09,
})

-- uma sequência: clap1 no beat b, clap2 em b+gap, resposta em b+2*gap
local function seq(b, gap)
  cue(b, "clap1")
  cue(b + gap, "clap2")
  expect(b + gap * 2)
end

local b = 4

-- fase 1: seis frases normais (aprende o intervalo de 1 beat)
for _ = 1, 6 do
  seq(b, 1)
  b = b + 6
end

-- fase 2: quatro frases rápidas (meio beat)
for _ = 1, 4 do
  seq(b, 0.5)
  b = b + 4
end

-- fase 3: alterna normal e rápida na mesma frase (o teste de verdade)
for _ = 1, 3 do
  seq(b, 1)
  seq(b + 4, 0.5)
  b = b + 8
end

on_hit(function(judgement, beat)
  play_sfx("clap", judgement == "perfect" and "clean" or "weak")
  anim("jogador", "bater")
end)

on_miss(function(beat)
  anim("jogador", "errar")
end)
