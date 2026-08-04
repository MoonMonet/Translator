import { create } from "zustand";
import type { ApiProvider } from "./translatorStore";
import { invoke } from "@tauri-apps/api/core";

export type ProviderMode = "api" | "web";

export const MIN_UI_SCALE = 0.7;
export const MAX_UI_SCALE = 2;
const clampScale = (scale: number) =>
  Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, scale));

const STORE_DEFAULTS = {
  darkMode: true,
  autostart: false,
  apiKeys: { deepl: "", google: "", bing: "", lara: "", custom: "" },
  activeApi: "google",
  providerModes: {} as Record<string, ProviderMode>,
  uiScale: 1,
  lastUpdateCheck: 0,
  popupSourceLang: "auto",
  popupTargetLang: "en",
};

interface SettingsState {
  darkMode: boolean;
  autostart: boolean;
  settingsOpen: boolean;
  apiKeys: Record<ApiProvider, string>;
  activeApi: ApiProvider;
  providerModes: Record<string, ProviderMode>;
  uiScale: number;

  setDarkMode: (dark: boolean) => void;
  setAutostart: (auto: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setApiKey: (provider: ApiProvider, key: string) => void;
  setActiveApi: (api: ApiProvider) => void;
  setProviderMode: (provider: string, mode: ProviderMode) => void;
  setUiScale: (scale: number) => void;
  loadFromStore: () => Promise<void>;
  saveToStore: () => Promise<void>;
}


export const useSettingsStore = create<SettingsState>((set, get) => ({
  darkMode: true,
  autostart: false,
  settingsOpen: false,
  apiKeys: {
    deepl: "",
    google: "",
    bing: "",
    lara: "",
    custom: "",
  },
  activeApi: "google",
  providerModes: {},
  uiScale: 1,

  setDarkMode: (dark: boolean) => {
    set({ darkMode: dark });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", dark);
    }
  },

  setAutostart: (auto: boolean) => set({ autostart: auto }),
  setSettingsOpen: (open: boolean) => set({ settingsOpen: open }),

  setApiKey: (provider: ApiProvider, key: string) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key },
    })),

  setActiveApi: (api: ApiProvider) => set({ activeApi: api }),

  setProviderMode: (provider: string, mode: ProviderMode) =>
    set((state) => ({
      providerModes: { ...state.providerModes, [provider]: mode },
    })),

  setUiScale: (scale: number) =>
    set({ uiScale: Math.round(clampScale(scale) * 100) / 100 }),

  loadFromStore: async () => {
    try {
      const dataStr = await invoke<string>("load_settings");
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        const finalDarkMode = parsed.darkMode ?? true;
        set({
          darkMode: finalDarkMode,
          autostart: parsed.autostart ?? false,
          apiKeys: { ...STORE_DEFAULTS.apiKeys, ...(parsed.apiKeys || {}) },
          activeApi: parsed.activeApi ?? "google",
          providerModes: { ...STORE_DEFAULTS.providerModes, ...(parsed.providerModes || {}) },
          uiScale: clampScale(parsed.uiScale ?? STORE_DEFAULTS.uiScale),
        });
        if (finalDarkMode) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      } else {
        
        set({ darkMode: true });
        document.documentElement.classList.add("dark");
      }
    } catch (e) {
      console.log("Running outside Tauri, using defaults", e);
      set({ darkMode: true });
      document.documentElement.classList.add("dark");
    }
  },

  saveToStore: async () => {
    try {
      const state = get();
      const payload = JSON.stringify({
        darkMode: state.darkMode,
        autostart: state.autostart,
        apiKeys: state.apiKeys,
        activeApi: state.activeApi,
        providerModes: state.providerModes,
        uiScale: state.uiScale,
      });
      await invoke("save_settings", { payload });
    } catch (e) {
      console.log("Failed to save native store:", e);
    }
  },
}));