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
