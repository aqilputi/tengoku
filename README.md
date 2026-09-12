# Tengoku

Engine de jogo de ritmo para browser — call-and-response estilo Rhythm Heaven.
TypeScript + Web Audio API no núcleo; charts escritos em Lua (wasmoon); Canvas 2D;
build 100% estático.

## Documentação

| Doc | O quê |
|---|---|
| [docs/OKR.md](docs/OKR.md) | Objetivos e Key Results do ciclo v1 (formato Google, scoring 0.0–1.0) |
| [docs/SPEC.md](docs/SPEC.md) | Especificação técnica: arquitetura, timing, formato de chart, armadilhas |
| [docs/PLANO.md](docs/PLANO.md) | Plano de implementação M0–M7: interfaces TS, decisões, testes (+ adendo pós-pesquisa) |
| [docs/PESQUISA.md](docs/PESQUISA.md) | Validação dos requisitos em repositórios externos (Bemuse, taiko-web, FNF, Tone.js, wasmoon) |
| [docs/LOG.md](docs/LOG.md) | Log de decisões, pesquisa e progresso |

## Toolchain

Gerenciada via [pixi](https://pixi.sh) (`pixi.toml` pina node 22, lua 5.4, stylua,
lua-language-server; lockfile em `pixi.lock` após o primeiro `pixi install`).

```sh
pixi install        # resolve o ambiente
pixi run dev        # vite dev server
pixi run test       # vitest
pixi run setup-lua  # instala luacheck via luarocks (uma vez)
pixi run lint-chart # luacheck nos charts (globals da DSL em .luacheckrc)
pixi run fmt-chart  # stylua em charts/ e lua-types/
```

Charts têm autocomplete no editor via `lua-types/chart-api.lua` (stubs `---@meta`
para o lua-language-server, configurado em `.luarc.json`).
