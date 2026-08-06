"use client";

import { useTranslatorStore } from "@/store/translatorStore";
import { useRef, useEffect } from "react";
import { X } from "lucide-react";

export default function TranslatorInput() {
  const { sourceText, setSourceText, charCount, wordCount, clearAll } =
    useTranslatorStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const fn = await listen("focus-input", () => textareaRef.current?.focus());
        if (mounted) unlisten = fn;
        else fn();
      } catch {}
    })();
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <textarea
        ref={textareaRef}
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Enter text to translate..."
        className="flex-1 w-full resize-none focus:outline-none min-h-0 bg-transparent text-foreground p-5 text-[15px] leading-relaxed tracking-wide caret-primary"
        spellCheck={false}
        autoFocus
      />
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0 opacity-80"
      >
        <div
          className="flex items-center gap-3 text-xs font-mono text-secondary tracking-widest"
        >
          <span>{charCount} chars</span>
          <span className="text-(--md-outline-variant)">•</span>
          <span>{wordCount} words</span>
        </div>
        {sourceText ? (
          <button
            onClick={() => clearAll()}
            className="md-icon-btn state-layer animate-fade-in w-9 h-9"
            title="Clear text"
          >
            <X size={16} />
          </button>
        ) : (
          <div className="w-9 h-9" />
        )}
      </div>
    </div>
  );
}
