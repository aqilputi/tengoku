---@meta
-- Stubs da API de chart (SPEC §3, PLANO M4) para o lua-language-server.
-- Só documentação de editor: o runtime real é injetado pelo LuaHost (src/lua/api.ts).

---@class SongOpts
---@field audio string caminho dentro de assets/
---@field title string
---@field offset number segundos do início do arquivo até o beat 0
---@field bpm number? açúcar para segments = {{startBeat=0, bpm=bpm}}
---@field segments {startBeat: number, bpm: number}[]?

---Declara a música do chart. Deve ser chamado exatamente uma vez.
---@param opts SongOpts
function song(opts) end

---Seleciona o minigame e sobrepõe opções (ex.: janela_perfeito).
---@param name string
---@return fun(opts: table<string, number>)
function minigame(name) end

---Chamada (audível/visível) num beat.
---@param beat number
---@param sfx string?
function cue(beat, sfx) end

---Resposta esperada do jogador num beat.
---@param beat number
function expect(beat) end

---Animação declarativa ancorada em beat.
---@param beat number
---@param target string
---@param name string
function anim(beat, target, name) end

---Callback de acerto julgado pelo core.
---@param fn fun(judgement: "perfect"|"good", beat: number)
function on_hit(fn) end

---Callback de erro (miss por omissão ou input extra).
---@param fn fun(beat: number)
function on_miss(fn) end

---[runtime, só dentro de on_hit/on_miss] Dispara SFX imediato.
---@param name string
---@param variant string?
function play_sfx(name, variant) end
