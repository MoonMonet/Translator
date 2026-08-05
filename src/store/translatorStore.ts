import { create } from "zustand";

export type ApiProvider = "deepl" | "google" | "bing" | "lara" | "custom";

export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: Language[] = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "ru", name: "Russian" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "cs", name: "Czech" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "el", name: "Greek" },
  { code: "hu", name: "Hungarian" },
  { code: "ro", name: "Romanian" },
  { code: "bg", name: "Bulgarian" },
  { code: "sk", name: "Slovak" },
  { code: "id", name: "Indonesian" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "hi", name: "Hindi" },
];

export const API_PROVIDERS: { id: ApiProvider; name: string }[] = [
  { id: "deepl", name: "DeepL" },
  { id: "google", name: "Google Translate" },
  { id: "bing", name: "Microsoft Bing" },
  { id: "lara", name: "Lara Translate" },
  { id: "custom", name: "Custom API URL" },
];

interface TranslatorState {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  isTranslating: boolean;
  error: string | null;
  detectedLanguage: string | null;
  autoTranslate: boolean;
  activeApi: ApiProvider;
  charCount: number;
  wordCount: number;
  alternatives: string[];

  setSourceText: (text: string) => void;
  setTranslatedText: (text: string) => void;
  setSourceLang: (lang: string) => void;
  setTargetLang: (lang: string) => void;
  setIsTranslating: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setDetectedLanguage: (lang: string | null) => void;
  setAutoTranslate: (auto: boolean) => void;
  setActiveApi: (api: ApiProvider) => void;
  setAlternatives: (alternatives: string[]) => void;
  swapLanguages: () => void;
  clearAll: () => void;
}

export const useTranslatorStore = create<TranslatorState>((set, get) => ({
  sourceText: "",
  translatedText: "",
  sourceLang: "auto",
  targetLang: "en",
  isTranslating: false,
  error: null,
  detectedLanguage: null,
  autoTranslate: true,
  activeApi: "google",
  charCount: 0,
  wordCount: 0,
  alternatives: [],

  setSourceText: (text: string) =>
    set({
      sourceText: text,
      charCount: text.length,
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      error: null,
    }),

  setTranslatedText: (text: string) => set({ translatedText: text }),
  setSourceLang: (lang: string) => set({ sourceLang: lang }),
  setTargetLang: (lang: string) => set({ targetLang: lang }),
  setIsTranslating: (loading: boolean) => set({ isTranslating: loading }),
  setError: (error: string | null) => set({ error }),
  setDetectedLanguage: (lang: string | null) => set({ detectedLanguage: lang }),
  setAutoTranslate: (auto: boolean) => set({ autoTranslate: auto }),
  setActiveApi: (api: ApiProvider) => set({ activeApi: api }),
  setAlternatives: (alternatives: string[]) => set({ alternatives }),

  swapLanguages: () => {
    const state = get();
    if (state.sourceLang === "auto") return;
    set({
      sourceLang: state.targetLang,
      targetLang: state.sourceLang,
      sourceText: state.translatedText,
      translatedText: state.sourceText,
    });
  },

  clearAll: () =>
    set({
      sourceText: "",
      translatedText: "",
      error: null,
      detectedLanguage: null,
      charCount: 0,
      wordCount: 0,
      alternatives: [],
    }),
}));
