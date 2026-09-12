-- Chart de exemplo (SPEC §3): call-and-response estilo clappy.
-- Chamadas nos beats b, b+1, b+2; respostas em b+4, b+5, b+6, a cada 8 beats.

song({
  audio = "assets/audio/musica1.ogg",
  bpm = 124,
  offset = 0.312, -- segundos até o beat 0 (medido no arquivo real)
  title = "Musica 1",
})

minigame("clappy")({
  janela_perfeito = 0.045,
  janela_bom = 0.09,
})

for i = 0, 7 do
  local b = 4 + i * 8
  cue(b, "call")
  cue(b + 1, "call")
  cue(b + 2, "call")
  expect(b + 4)
  expect(b + 5)
  expect(b + 6)
end

on_hit(function(judgement, beat)
  play_sfx("clap", judgement == "perfect" and "clean" or "weak")
  anim("personagem", "bater")
end)

on_miss(function(beat)
  anim("personagem", "errar")
end)
