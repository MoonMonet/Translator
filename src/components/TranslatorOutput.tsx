"use client";

import { useTranslatorStore } from "@/store/translatorStore";
import { Copy, Check, TriangleAlert, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";

function WordTokenWithPopup({
  token,
  isOpen,
  isClosing,
  onClick,
  onSelectAlternative,
  wordState,
}: {
  token: string;
  isOpen: boolean;
  isClosing: boolean;
  onClick: () => void;
  onSelectAlternative: (replacement: string) => void;
  wordState?: { loading: boolean; alts: string[] };
}) {
  const tokenRef = useRef<HTMLSpanElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isOpen && tokenRef.current) {
      const rect = tokenRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const popupWidth = 256;

      if (rect.left + popupWidth > windowWidth - 20) {
        setPopupStyle({ right: "0px", left: "auto" });
      } else {
        setPopupStyle({ left: "0px", right: "auto" });
      }
    }
  }, [isOpen]);

  return (
    <span ref={tokenRef} className="relative inline-block max-w-full break-words [overflow-wrap:anywhere]">
      <span
        onClick={onClick}
        className={`transition-all duration-150 rounded px-0.5 -mx-0.5 cursor-pointer inline ${
          isOpen
            ? "text-[var(--md-primary)] bg-[var(--md-primary-container)]/70 font-medium"
            : "hover:text-[var(--md-primary)] hover:bg-[var(--md-primary-container)]/40"
        }`}
      >
        {token}
      </span>

      {isOpen && (
        <div
          style={{ ...popupStyle, boxShadow: "var(--md-elevation-3)" }}
          className={`absolute z-50 top-full mt-1.5 w-64 max-w-[calc(100vw-2.5rem)] rounded-xl p-3 shadow-xl border border-[var(--md-outline-variant)]/30 bg-[var(--md-surface-container-high)] backdrop-blur-xl ${
            isClosing ? "animate-collapse-morph" : "animate-expand-morph"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-[var(--md-outline-variant)]/20 text-[var(--md-primary)]">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <Sparkles size={13} className="shrink-0" />
              <span className="truncate">{token}</span>
            </div>
            <span className="text-[11px] font-medium opacity-80 shrink-0 ml-2" style={{ color: "var(--md-on-surface-variant)" }}>
              Alternatives
            </span>
          </div>

          <div className="pt-2.5">
            {wordState?.loading ? (
              <div className="flex flex-col gap-1.5 py-1">
                <div className="skeleton h-5 w-full rounded-md" />
                <div className="skeleton h-5 w-3/4 rounded-md" />
              </div>
            ) : wordState?.alts && wordState.alts.length > 0 ? (
              <div
                className={
                  wordState.alts.length > 3
                    ? "grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto"
                    : "flex flex-wrap gap-1.5 max-h-40 overflow-y-auto"
                }
              >
                {wordState.alts.map((alt, altIdx) => (
                  <button
                    key={altIdx}
                    type="button"
                    onClick={() => onSelectAlternative(alt)}
                    className="text-left px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--md-surface-container-highest)] hover:bg-[var(--md-primary-container)] hover:text-[var(--md-on-primary-container)] transition-all cursor-pointer truncate"
                    title={`Use "${alt}"`}
                  >
                    {alt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs py-1 opacity-70 italic text-[var(--md-on-surface-variant)]">
                No word alternatives available
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

function InteractiveTranslatedText({
  translatedText,
  alternatives,
  onSelectAlternative,
}: {
  translatedText: string;
  alternatives: string[];
  onSelectAlternative: (alt: string) => void;
}) {
  const [activeWordIdx, setActiveWordIdx] = useState<number | null>(null);
  const [closingWordIdx, setClosingWordIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [wordAltsMap, setWordAltsMap] = useState<Record<number, { loading: boolean; alts: string[] }>>({});
  const { targetLang } = useTranslatorStore();

  const tokens = translatedText.split(/(\s+)/);

  const closePopup = (idxToClose?: number) => {
    const target = idxToClose ?? activeWordIdx;
    if (target === null) return;
    setClosingWordIdx(target);
    setTimeout(() => {
      setActiveWordIdx(null);
      setClosingWordIdx(null);
    }, 180);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePopup();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeWordIdx]);

  const fetchWordAlternatives = async (wordIdx: number, wordToken: string) => {
    const cleanWord = wordToken.replace(/[^\p{L}\p{N}]/gu, "").trim();
    if (!cleanWord) return;

    setWordAltsMap((prev) => ({ ...prev, [wordIdx]: { loading: true, alts: [] } }));

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ alternatives: string[]; translated_text: string }>("translate_text", {
        request: {
          text: cleanWord,
          from: "auto",
          to: targetLang || "en",
          api: "google",
          api_key: "",
          use_free_api: true,
        },
      });

      const uniqueAlts = Array.from(
        new Set(
          [result.translated_text, ...(result.alternatives || [])]
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.toLowerCase() !== cleanWord.toLowerCase())
        )
      );

      setWordAltsMap((prev) => ({
        ...prev,
        [wordIdx]: { loading: false, alts: uniqueAlts },
      }));
    } catch {
      setWordAltsMap((prev) => ({
        ...prev,
        [wordIdx]: { loading: false, alts: [] },
      }));
    }
  };

  const handleWordClick = (wordIdx: number, wordToken: string) => {
    if (activeWordIdx === wordIdx) {
      closePopup(wordIdx);
    } else {
      setClosingWordIdx(null);
      setActiveWordIdx(wordIdx);
      if (!wordAltsMap[wordIdx]) {
        fetchWordAlternatives(wordIdx, wordToken);
      }
    }
  };

  const handleWordSelect = (wordIdx: number, replacement: string) => {
    const newTokens = [...tokens];
    newTokens[wordIdx] = replacement;
    onSelectAlternative(newTokens.join(""));
    closePopup(wordIdx);
  };

  return (
    <div ref={containerRef} className="relative w-full leading-relaxed break-words [overflow-wrap:anywhere]">
      {tokens.map((token, idx) => {
        const isWhitespace = /^\s+$/.test(token);
        if (isWhitespace) {
          return <span key={idx}>{token}</span>;
        }

        const isActive = activeWordIdx === idx;
        const isClosing = closingWordIdx === idx;
        const isOpen = isActive || isClosing;

        return (
          <WordTokenWithPopup
            key={idx}
            token={token}
            isOpen={isOpen}
            isClosing={isClosing}
            onClick={() => handleWordClick(idx, token)}
            onSelectAlternative={(replacement) => handleWordSelect(idx, replacement)}
            wordState={wordAltsMap[idx]}
          />
        );
      })}
    </div>
  );
}

export default function TranslatorOutput() {
  const { translatedText, alternatives, isTranslating, error, setTranslatedText } =
    useTranslatorStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const { writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        await writeText(translatedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.error("Failed to copy:", e);
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 relative overflow-hidden" style={{ background: "transparent" }}>
      <div className="flex-1 p-5 min-h-0 overflow-y-auto overflow-x-hidden break-words text-[15px] leading-relaxed tracking-wide text-foreground">
        {isTranslating ? (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-4 w-3/5" />
          </div>
        ) : error ? (
          <div className="flex flex-col gap-3 p-4 text-sm animate-fade-in bg-error-container text-error rounded-(--md-shape-md) border border-error/20">
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} className="shrink-0 mt-0.5" />
              <span className="leading-snug wrap-break-word">{error}</span>
            </div>
            <div className="mt-1 pl-7">
              <a
                href="https://github.com/noxygalaxy/moontranslator/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline hover:opacity-80 transition-opacity text-error"
              >
                Report this issue on GitHub
              </a>
            </div>
          </div>
        ) : translatedText ? (
          <div key={translatedText} className="animate-fade-in relative whitespace-pre-wrap">
            <InteractiveTranslatedText
              translatedText={translatedText}
              alternatives={alternatives}
              onSelectAlternative={(alt) => setTranslatedText(alt)}
            />
          </div>
        ) : (
          <div
            className="text-[15px] leading-relaxed tracking-wide"
            style={{
              color: "var(--md-on-surface-variant)",
              opacity: 0.5,
            }}
          >
            Translation will appear here...
          </div>
        )}
      </div>

      {translatedText && !isTranslating && (
        <div className="shrink-0 flex items-center justify-end px-6 py-3 pb-6">
          <button
            onClick={handleCopy}
            className="md-chip state-layer"
            style={
              copied
                ? {
                    background: "var(--md-primary-container)",
                    color: "var(--md-on-primary-container)",
                    borderColor: "transparent",
                  }
                : {
                    background: "var(--md-surface-container-high)",
                    borderColor: "transparent",
                  }
            }
          >
            {copied ? (
              <>
                <Check size={16} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} />
                Copy
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
