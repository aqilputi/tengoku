import type { AssetManifest } from "./types";

/** Fontes para um asset declarado: override local (por basename) primeiro. */
function sources(path: string): string[] {
  const base = path.split("/").pop()!;
  return [`/local/${base}`, `/${path}`];
}

export interface ManifestResult {
  /** nome do sprite -> pose -> imagem carregada. */
  sprites: Record<string, Record<string, HTMLImageElement>>;
  /** caminhos declarados que não carregaram (fallback do chamador decide). */
  missing: string[];
}

interface SfxRegistry {
  register(name: string, buffer: AudioBuffer): void;
}

/**
 * Carrega o manifesto `assets{}` do chart (DSL v2-A). Loaders injetáveis
 * (produção: tryLoadAudio/tryLoadImage). Nunca lança: ausência vira `missing`
 * e o chamador mantém os fallbacks (sons sintetizados, desenho vetorial).
 */
export async function loadManifest(
  ctx: AudioContext,
  sfxRegistry: SfxRegistry,
  manifest: AssetManifest,
  loadAudio: (ctx: AudioContext, urls: string[]) => Promise<AudioBuffer | null>,
  loadImage: (urls: string[]) => Promise<HTMLImageElement | null>,
): Promise<ManifestResult> {
  const missing: string[] = [];
  const jobs: Promise<void>[] = [];

  const sfxJob = (name: string, path: string) =>
    jobs.push(
      loadAudio(ctx, sources(path)).then((buf) => {
        if (buf) sfxRegistry.register(name, buf);
        else missing.push(path);
      }),
    );

  for (const [name, v] of Object.entries(manifest.sfx)) {
    if (typeof v === "string") sfxJob(name, v);
    else for (const [variant, path] of Object.entries(v)) sfxJob(`${name}_${variant}`, path);
  }

  const sprites: ManifestResult["sprites"] = {};
  for (const [name, poses] of Object.entries(manifest.sprites)) {
    for (const [pose, path] of Object.entries(poses)) {
      jobs.push(
        loadImage(sources(path)).then((img) => {
          if (img) (sprites[name] ??= {})[pose] = img;
          else missing.push(path);
        }),
      );
    }
  }

  await Promise.all(jobs);
  return { sprites, missing };
}

/** Dev-mode: `?chart=/local/meu.lua`. Só caminho relativo à origem (sem host externo). */
export function resolveChartParam(search: string): string | null {
  const p = new URLSearchParams(search).get("chart");
  if (!p) return null;
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}
