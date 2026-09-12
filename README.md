# Tengoku

Engine de jogo de ritmo para browser — call-and-response estilo Rhythm Heaven.
TypeScript + Web Audio API no núcleo; charts escritos em Lua (wasmoon); Canvas 2D;
build 100% estático.

## Documentação

Bundle [OKF (Open Knowledge Format)](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
em [docs/index.md](docs/index.md): [spec](docs/spec.md) · [plano](docs/plano.md) ·
[pesquisa](docs/pesquisa.md) · [deploy](docs/deploy.md) · [log](docs/log.md)

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
