import { SM2State } from './sm2';
import {
  DEFAULT_HINT_PANEL_LAYOUT,
  DEFAULT_OLLAMA_SETTINGS,
  HintHistoryEntry,
  HintPanelLayout,
  LEGACY_DEFAULT_SYSTEM_PROMPT,
  OllamaSettings,
} from './ollama';

export interface ProblemData extends SM2State {
  slug: string;
}

const OLLAMA_SETTINGS_KEY = 'ollama:settings';
const HINT_HISTORY_PREFIX = 'ollama:hints:';
const HINT_PANEL_LAYOUT_KEY = 'ollama:panel-layout';

// Compress to "interval|ease|repetitions|nextReview"
function serializeState(state: SM2State): string {
  return `${state.interval}|${state.ease}|${state.repetitions}|${state.nextReview}`;
}

function deserializeState(data: string): SM2State {
  const parts = data.split('|');
  return {
    interval: Number(parts[0]),
    ease: Number(parts[1]),
    repetitions: Number(parts[2]),
    nextReview: Number(parts[3])
  };
}

export const storage = {
  async saveProblem(slug: string, state: SM2State): Promise<void> {
    const key = `p:${slug}`;
    const value = serializeState(state);
    await chrome.storage.sync.set({ [key]: value });
  },

  async deleteProblem(slug: string): Promise<void> {
    const key = `p:${slug}`;
    await chrome.storage.sync.remove(key);
  },

  async getProblem(slug: string): Promise<ProblemData | null> {
    const key = `p:${slug}`;
    const result = await chrome.storage.sync.get(key);
    if (result[key]) {
      return {
        slug,
        ...deserializeState(result[key] as string)
      };
    }
    return null;
  },

  async getAllProblems(): Promise<ProblemData[]> {
    const result = await chrome.storage.sync.get(null);
    const problems: ProblemData[] = [];
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('p:')) {
        const slug = key.substring(2);
        problems.push({
          slug,
          ...deserializeState(value as string)
        });
      }
    }
    return problems;
  },

  async getDueProblems(): Promise<ProblemData[]> {
    const all = await this.getAllProblems();
    const now = Date.now();
    return all.filter(p => p.nextReview <= now);
  }
};

export const ollamaStorage = {
  async getSettings(): Promise<OllamaSettings> {
    const result = await chrome.storage.local.get(OLLAMA_SETTINGS_KEY);
    const saved = result[OLLAMA_SETTINGS_KEY] as Partial<OllamaSettings> | undefined;
    const systemPrompt = saved?.systemPrompt === LEGACY_DEFAULT_SYSTEM_PROMPT
      ? DEFAULT_OLLAMA_SETTINGS.systemPrompt
      : saved?.systemPrompt;
    return {
      ...DEFAULT_OLLAMA_SETTINGS,
      ...saved,
      ...(systemPrompt ? { systemPrompt } : {}),
      learnerRequest: saved?.learnerRequest?.trim() || DEFAULT_OLLAMA_SETTINGS.learnerRequest,
    };
  },

  async saveSettings(settings: OllamaSettings): Promise<void> {
    await chrome.storage.local.set({ [OLLAMA_SETTINGS_KEY]: settings });
  },

  async getHintHistory(slug: string): Promise<HintHistoryEntry[]> {
    const key = `${HINT_HISTORY_PREFIX}${slug}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as HintHistoryEntry[] | undefined) ?? [];
  },

  async saveHintHistory(slug: string, history: HintHistoryEntry[]): Promise<void> {
    await chrome.storage.local.set({ [`${HINT_HISTORY_PREFIX}${slug}`]: history });
  },

  async getPanelLayout(): Promise<HintPanelLayout> {
    const result = await chrome.storage.local.get(HINT_PANEL_LAYOUT_KEY);
    return {
      ...DEFAULT_HINT_PANEL_LAYOUT,
      ...(result[HINT_PANEL_LAYOUT_KEY] as Partial<HintPanelLayout> | undefined),
    };
  },

  async savePanelLayout(layout: HintPanelLayout): Promise<void> {
    await chrome.storage.local.set({ [HINT_PANEL_LAYOUT_KEY]: layout });
  },
};
