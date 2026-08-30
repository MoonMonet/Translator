import { create } from "zustand";
import type { ApiProvider } from "./translatorStore";
import { invoke } from "@tauri-apps/api/core";

export type ProviderMode = "api" | "web";

export const MIN_UI_SCALE = 0.7;
export const MAX_UI_SCALE = 1.7;
const IS_MAC =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
const DEFAULT_POPUP_HOTKEY = IS_MAC ? "Super+C" : "Ctrl+C";
const clampScale = (scale: number) =>
  Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, scale));

const STORE_DEFAULTS = {
  darkMode: true,
  autostart: false,
  startMinimized: false,
  apiKeys: { deepl: "", google: "", bing: "", lara: "", custom: "" },
  activeApi: "google",
  providerModes: {} as Record<string, ProviderMode>,
  openHotkey: "Ctrl+Shift+T",
  popupHotkey: DEFAULT_POPUP_HOTKEY,
  uiScale: 1,
  lastUpdateCheck: 0,
  popupSourceLang: "auto",
  popupTargetLang: "en",
};

interface SettingsState {
  darkMode: boolean;
  autostart: boolean;
  startMinimized: boolean;
  settingsOpen: boolean;
  apiKeys: Record<ApiProvider, string>;
  activeApi: ApiProvider;
  providerModes: Record<string, ProviderMode>;
  openHotkey: string;
  popupHotkey: string;
  uiScale: number;

  setDarkMode: (dark: boolean) => void;
  setAutostart: (auto: boolean) => void;
  setStartMinimized: (minimized: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setApiKey: (provider: ApiProvider, key: string) => void;
  setActiveApi: (api: ApiProvider) => void;
  setProviderMode: (provider: string, mode: ProviderMode) => void;
  setOpenHotkey: (accel: string) => void;
  setPopupHotkey: (accel: string) => void;
  setUiScale: (scale: number) => void;
  loadFromStore: () => Promise<void>;
  saveToStore: () => Promise<void>;
  clearStore: () => Promise<void>;
}


export const useSettingsStore = create<SettingsState>((set, get) => ({
  darkMode: true,
  autostart: false,
  startMinimized: false,
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
  openHotkey: "Ctrl+Shift+T",
  popupHotkey: DEFAULT_POPUP_HOTKEY,
  uiScale: 1,

  setDarkMode: (dark: boolean) => {
    set({ darkMode: dark });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", dark);
    }
  },

  setAutostart: (auto: boolean) => set({ autostart: auto }),
  setStartMinimized: (minimized: boolean) => set({ startMinimized: minimized }),
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

  setOpenHotkey: (accel: string) => set({ openHotkey: accel }),
  setPopupHotkey: (accel: string) => set({ popupHotkey: accel }),
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
          startMinimized: parsed.startMinimized ?? false,
          apiKeys: { ...STORE_DEFAULTS.apiKeys, ...(parsed.apiKeys || {}) },
          activeApi: parsed.activeApi ?? "google",
          providerModes: { ...STORE_DEFAULTS.providerModes, ...(parsed.providerModes || {}) },
          openHotkey: parsed.openHotkey ?? STORE_DEFAULTS.openHotkey,
          popupHotkey: parsed.popupHotkey ?? STORE_DEFAULTS.popupHotkey,
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
        startMinimized: state.startMinimized,
        apiKeys: state.apiKeys,
        activeApi: state.activeApi,
        providerModes: state.providerModes,
        openHotkey: state.openHotkey,
        popupHotkey: state.popupHotkey,
        uiScale: state.uiScale,
      });
      await invoke("save_settings", { payload });
    } catch (e) {
      console.log("Failed to save native store:", e);
    }
  },

  clearStore: async () => {
    try {
      await invoke("save_settings", { payload: "{}" });
    } catch (e) {
      console.log("Failed to clear native store:", e);
    }
  },
}));