"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { learnerPurchase, learningLink } from "../lib/public-learning.mjs";
import { CommerceIcon } from "./commerce-ui";

const LearningSession = createContext({
  purchases: [],
  remember: () => {},
  clear: () => {},
});

// Active-tab purchase capabilities only. Never put these in browser storage or navigation state.
export function LearningSessionProvider({ children }) {
  const [purchases, setPurchases] = useState([]);
  const clear = useCallback(() => setPurchases([]), []);
  const remember = useCallback((items) => {
    const valid = items.flatMap((item) => {
      try {
        return [learnerPurchase(item)];
      } catch {
        return [];
      }
    });
    if (!valid.length) return;
    setPurchases((current) => {
      const merged = new Map(current.map((item) => [item.key, item]));
      for (const item of valid) merged.set(item.key, item);
      const next = [...merged.values()].slice(-32);
      return next.length === current.length &&
        next.every(
          (item, index) =>
            item.key === current[index].key &&
            item.accessUrl === current[index].accessUrl &&
            item.playerUrl === current[index].playerUrl &&
            item.title === current[index].title,
        )
        ? current
        : next;
    });
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, [clear]);
  const value = useMemo(
    () => ({ purchases, remember, clear }),
    [purchases, remember, clear],
  );
  return (
    <LearningSession.Provider value={value}>
      {children}
    </LearningSession.Provider>
  );
}

export const useLearningSession = () => useContext(LearningSession);

export function MyLearningLink({
  store,
  language = "en",
  className = "",
  children,
  onClick,
}) {
  return (
    <Link
      href={learningLink(store, language)}
      prefetch={false}
      className={`learning-nav-link ${className}`}
      onClick={onClick}
    >
      <CommerceIcon name="book" size={18} />
      <span>
        {children || (language === "fr" ? "Mes formations" : "My learning")}
      </span>
    </Link>
  );
}
