-- Lint dos charts: a DSL (SPEC §3 / PLANO M4) vive em globals injetados pelo LuaHost.
std = "lua54"
read_globals = {
  -- fase de carga
  "song", "minigame", "cue", "expect", "anim",
  "on_hit", "on_miss",
  -- fase de runtime (dentro de on_hit/on_miss)
  "play_sfx",
}
-- O sandbox remove estes; usar num chart é erro, não warning.
not_globals = {
  "io", "os", "require", "package", "load", "loadfile", "dofile",
  "loadstring", "debug", "collectgarbage", "print",
}
-- callbacks da DSL têm assinatura fixa; argumento não usado não é erro do chart
unused_args = false
files["charts/"] = { max_line_length = 100 }
exclude_files = { "node_modules/", "dist/" }
