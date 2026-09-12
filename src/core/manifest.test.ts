import { describe, it, expect } from "vitest";
import { loadManifest } from "./manifest";
import type { AssetManifest } from "./types";

function fakes(okAudio: string[], okImage: string[]) {
  const registered: Array<[string, string]> = []; // [nome, url que carregou]
  const sfxRegister = { register: (name: string, buf: unknown) => registered.push([name, String(buf)]) };
  const loadAudio = async (_ctx: unknown, urls: string[]) => {
    for (const u of urls) if (okAudio.includes(u)) return u as unknown as AudioBuffer;
    return null;
  };
  const loadImage = async (urls: string[]) => {
    for (const u of urls) if (okImage.includes(u)) return { src: u } as unknown as HTMLImageElement;
    return null;
  };
  return { registered, sfxRegister, loadAudio, loadImage };
}

const MANIFEST: AssetManifest = {
  sfx: {
    clap1: "assets/sfx/clap1.wav",
    clap: { clean: "assets/sfx/clap_clean.wav", weak: "assets/sfx/clap_weak.wav" },
  },
  sprites: { trio1: { idle: "assets/sprites/trio1_idle.svg" } },
};

describe("loadManifest", () => {
  it("sfx flat registra pelo nome; variantes registram como nome_variante", async () => {
    const f = fakes(["/assets/sfx/clap1.wav", "/assets/sfx/clap_clean.wav", "/assets/sfx/clap_weak.wav"], []);
    await loadManifest(null as unknown as AudioContext, f.sfxRegister, MANIFEST, f.loadAudio, f.loadImage);
    const names = f.registered.map(([n]) => n).sort();
    expect(names).toEqual(["clap1", "clap_clean", "clap_weak"]);
  });

  it("override local por basename vem PRIMEIRO na ordem de fontes", async () => {
    const f = fakes(["/local/clap1.wav", "/assets/sfx/clap1.wav"], ["/local/trio1_idle.svg"]);
    const r = await loadManifest(null as unknown as AudioContext, f.sfxRegister, MANIFEST, f.loadAudio, f.loadImage);
    expect(f.registered.find(([n]) => n === "clap1")![1]).toBe("/local/clap1.wav");
    expect((r.sprites.trio1!.idle as unknown as { src: string }).src).toBe("/local/trio1_idle.svg");
  });

  it("asset ausente: não registra, não lança, aparece em missing", async () => {
    const f = fakes([], []);
    const r = await loadManifest(null as unknown as AudioContext, f.sfxRegister, MANIFEST, f.loadAudio, f.loadImage);
    expect(f.registered).toEqual([]);
    expect(r.sprites).toEqual({});
    expect(r.missing.sort()).toEqual([
      "assets/sfx/clap1.wav",
      "assets/sfx/clap_clean.wav",
      "assets/sfx/clap_weak.wav",
      "assets/sprites/trio1_idle.svg",
    ]);
  });

  it("manifesto vazio: no-op", async () => {
    const f = fakes([], []);
    const r = await loadManifest(
      null as unknown as AudioContext, f.sfxRegister, { sfx: {}, sprites: {} }, f.loadAudio, f.loadImage,
    );
    expect(r.missing).toEqual([]);
  });
});
