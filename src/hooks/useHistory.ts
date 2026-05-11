"use client";
import { useCallback, useState } from "react";

const STORAGE_KEY = "docs-lens:history";
const MAX_ENTRIES = 12;

export interface HistoryEntry {
  url: string;
  grade: string;
  overall: number;
  scannedAt: string;
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  const add = useCallback((entry: HistoryEntry) => {
    setHistory((h) => {
      const dedup = h.filter((x) => x.url !== entry.url);
      const next = [entry, ...dedup].slice(0, MAX_ENTRIES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { history, add, clear };
}
