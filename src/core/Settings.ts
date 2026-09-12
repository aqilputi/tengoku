/** Persistência de configuração (PLANO M6). Storage injetável p/ teste. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface UserSettings {
  version: 1;
  audioOffsetS: number;
  visualOffsetS: number;
  /** null => força calibração antes de jogar (SPEC §2.4). */
  calibratedAt: string | null;
}

const KEY = "tengoku.settings";
/** A6: faixa −200..+500ms (negativo permitido, ao contrário do Bemuse). */
export const OFFSET_MIN_S = -0.2;
export const OFFSET_MAX_S = 0.5;

const DEFAULTS: UserSettings = { version: 1, audioOffsetS: 0, visualOffsetS: 0, calibratedAt: null };

export function clampOffset(s: number): number {
  return Math.min(OFFSET_MAX_S, Math.max(OFFSET_MIN_S, s));
}

export function createSettings(storage: StorageLike) {
  return {
    load(): UserSettings {
      try {
        const raw = storage.getItem(KEY);
        if (!raw) return { ...DEFAULTS };
        const p = JSON.parse(raw) as Partial<UserSettings>;
        if (p.version !== 1) return { ...DEFAULTS };
        return {
          version: 1,
          audioOffsetS: clampOffset(typeof p.audioOffsetS === "number" ? p.audioOffsetS : 0),
          visualOffsetS: clampOffset(typeof p.visualOffsetS === "number" ? p.visualOffsetS : 0),
          calibratedAt: typeof p.calibratedAt === "string" ? p.calibratedAt : null,
        };
      } catch {
        return { ...DEFAULTS }; // JSON corrompido nunca derruba o boot
      }
    },
    save(s: UserSettings): void {
      storage.setItem(KEY, JSON.stringify(s));
    },
  };
}

/** Instância padrão sobre localStorage (browser). */
export const Settings = {
  load: () => createSettings(window.localStorage).load(),
  save: (s: UserSettings) => createSettings(window.localStorage).save(s),
};
