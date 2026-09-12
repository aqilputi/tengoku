/**
 * Carga de áudio com fontes em ordem de preferência (adendo A11: WebM/Opus ->
 * AAC -> OGG) e override local de teste (public/local/, fora do repo).
 * Nunca lança: null => o chamador usa o fallback sintetizado.
 */
export async function tryLoadAudio(
  ctx: AudioContext,
  urls: string[],
  fetchFn: typeof fetch = fetch,
): Promise<AudioBuffer | null> {
  for (const url of urls) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    } catch {
      continue; // 404/rede/codec: tenta a próxima fonte
    }
  }
  return null;
}

/**
 * Carga de imagem com fontes em ordem (override local > asset do repo).
 * Nunca lança: null => o chamador usa o desenho vetorial de fallback.
 */
export function tryLoadImage(
  urls: string[],
  createImg: () => HTMLImageElement = () => new Image(),
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const tryAt = (i: number) => {
      if (i >= urls.length) return resolve(null);
      const img = createImg();
      img.onload = () => resolve(img);
      img.onerror = () => tryAt(i + 1);
      img.src = urls[i]!;
    };
    tryAt(0);
  });
}
