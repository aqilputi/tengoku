import { describe, it, expect } from "vitest";
import { tryLoadAudio } from "./AssetLoader";

function fakeCtx(decodeOk = true) {
  return {
    decodeAudioData: async (buf: ArrayBuffer) => {
      if (!decodeOk) throw new Error("formato não suportado");
      return { decoded: buf.byteLength } as unknown as AudioBuffer;
    },
  } as unknown as AudioContext;
}

function fakeFetch(routes: Record<string, { ok: boolean; bytes?: number } | "throw">) {
  return (async (url: string) => {
    const r = routes[url];
    if (!r) return { ok: false } as Response;
    if (r === "throw") throw new Error("rede");
    return {
      ok: r.ok,
      arrayBuffer: async () => new ArrayBuffer(r.bytes ?? 8),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("tryLoadAudio (override local com fallback)", () => {
  it("retorna o primeiro que carrega e decodifica", async () => {
    const buf = await tryLoadAudio(fakeCtx(), ["/local/a.webm", "/local/a.m4a"], fakeFetch({
      "/local/a.webm": { ok: true, bytes: 42 },
    }));
    expect(buf).toEqual({ decoded: 42 });
  });

  it("404 e erro de rede caem para a próxima fonte", async () => {
    const buf = await tryLoadAudio(fakeCtx(), ["/x", "/y", "/z"], fakeFetch({
      "/x": { ok: false },
      "/y": "throw",
      "/z": { ok: true, bytes: 7 },
    }));
    expect(buf).toEqual({ decoded: 7 });
  });

  it("nenhuma fonte => null (chamador usa o fallback sintetizado), sem lançar", async () => {
    const buf = await tryLoadAudio(fakeCtx(), ["/x"], fakeFetch({}));
    expect(buf).toBeNull();
  });

  it("decode que falha (codec não suportado) também cai para a próxima", async () => {
    const buf = await tryLoadAudio(fakeCtx(false), ["/x"], fakeFetch({ "/x": { ok: true } }));
    expect(buf).toBeNull();
  });
});
