"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommerceIcon } from "../commerce-ui";
import { useLearningSession } from "../learning-session";
import { learningCopy, learningError } from "../../lib/learning-copy";
import { learningRequest } from "../../lib/learning-client";
import {
  learnerPurchasePage,
  learningReturnPath,
} from "../../lib/public-learning.mjs";
import LearningPlayer, {
  LearningFeedback,
  LearningSkeleton,
} from "./learning-player";

// Navigation labels are not credentials; support local HTTP mobile previews too.
const viewId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyPage = { content: [], totalPages: 0, totalElements: 0 };
const format = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

export default function LearningExperience({ initialLanguage, storeSlug }) {
  const [language, setLanguage] = useState(initialLanguage || "en");
  const c = learningCopy[language];
  const { purchases: recent, clear } = useLearningSession();
  const [session, setSession] = useState(null);
  const [library, setLibrary] = useState(emptyPage);
  const [page, setPage] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [flowCsrf, setFlowCsrf] = useState("");
  const [invalid, setInvalid] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const [selection, setSelection] = useState(null);
  const taskRef = useRef(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const current = useRef({});
  const views = useRef(new Map());
  const historyId = useRef(null);
  const emailInput = useRef(null);
  const codeInput = useRef(null);
  const title = useRef(null);
  const returnPath = learningReturnPath(storeSlug);
  current.current = { language, page, challenge, selection, recent };

  const purchases = useMemo(() => {
    const records = new Map(
      library.content.map((item) => [
        item.key,
        { ...item, origin: "recovery" },
      ]),
    );
    for (const item of recent)
      if (!records.has(item.key))
        records.set(item.key, { ...item, origin: "checkout" });
    return [...records.values()];
  }, [library, recent]);
  const selected =
    selection &&
    purchases.find(
      (item) => item.key === selection.key && item.origin === selection.origin,
    );

  const dropRecovered = useCallback(() => {
    setSession(null);
    setLibrary(emptyPage);
    setPage(0);
    setSelection((value) => (value?.origin === "recovery" ? null : value));
  }, []);

  const begin = (name) => {
    if (locked.current) return null;
    locked.current = true;
    taskRef.current?.abort();
    const task = new AbortController();
    taskRef.current = task;
    setBusy(name);
    setError(null);
    setNotice("");
    setInvalid("");
    return task;
  };
  const finish = (task) => {
    if (taskRef.current !== task) return;
    locked.current = false;
    if (!task.signal.aborted && mounted.current) setBusy("");
  };
  const recordError = (failure) => {
    setError(failure);
    if (failure.retryAfter > 0) {
      setNow(Date.now());
      setRetryAt(Date.now() + failure.retryAfter * 1000);
    }
  };

  const restore = useCallback(
    async (first = false) => {
      if (locked.current) return;
      locked.current = true;
      taskRef.current?.abort();
      const task = new AbortController();
      taskRef.current = task;
      if (!first) setBusy("refresh");
      try {
        const info = await learningRequest("session", {
          language: current.current.language,
          signal: task.signal,
        });
        const data = learnerPurchasePage(
          await learningRequest(
            `trainings?page=${current.current.page}&size=20`,
            { language: current.current.language, signal: task.signal },
          ),
        );
        if (task.signal.aborted || !mounted.current) return;
        setSession(info);
        setLibrary(data);
        setError(null);
        setNotice("");
      } catch (failure) {
        if (task.signal.aborted || !mounted.current) return;
        if (failure.status === 401) {
          dropRecovered();
          if (!first) setNotice("sessionExpired");
        } else recordError(failure);
      } finally {
        if (taskRef.current === task) {
          locked.current = false;
          if (!task.signal.aborted && mounted.current) {
            setInitialLoading(false);
            setBusy("");
          }
        }
      }
    },
    [dropRecovered],
  );

  useEffect(() => {
    mounted.current = true;
    historyId.current = viewId();
    if (!initialLanguage)
      setLanguage(
        navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en",
      );
    setNow(Date.now());
    void restore(true);
    const pop = () => {
      const view = window.history.state?.learningView;
      setSelection(
        view?.session === historyId.current
          ? views.current.get(view.id) || null
          : null,
      );
    };
    const focus = () => {
      if (!document.hidden && !current.current.challenge) void restore();
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      mounted.current = false;
      taskRef.current?.abort();
      locked.current = false;
      views.current.clear();
      window.removeEventListener("popstate", pop);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [initialLanguage, restore]);

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [language]);
  useEffect(() => {
    if (!challenge && !retryAt) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [challenge, retryAt]);
  useEffect(() => {
    if (!session?.expiresAt) return;
    const timeout = setTimeout(
      () => {
        dropRecovered();
        setNotice("sessionExpired");
      },
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [session, dropRecovered]);
  useEffect(() => {
    if (!initialLoading && !selected)
      title.current?.focus({ preventScroll: true });
  }, [initialLoading, selected?.key]);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge?.id]);

  const backToLibrary = () => {
    if (window.history.state?.learningView?.session === historyId.current)
      window.history.back();
    else setSelection(null);
  };
  const select = (purchase) => {
    const id = viewId();
    const value = { key: purchase.key, origin: purchase.origin };
    views.current.set(id, value);
    window.history.pushState(
      {
        ...window.history.state,
        learningView: { session: historyId.current, id },
      },
      "",
      window.location.href,
    );
    setSelection(value);
    setError(null);
    setNotice("");
    setAuthOpen(false);
  };
  const recover = () => {
    setSelection(null);
    setAuthOpen(true);
    setError(null);
    setNotice("");
    const state = { ...window.history.state };
    delete state.learningView;
    window.history.replaceState(state, "", window.location.href);
    window.requestAnimationFrame(() => emailInput.current?.focus());
  };
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const resendWait = Math.max(
    0,
    Math.ceil(((challenge?.resendAt || 0) - now) / 1000),
  );
  const expired = challenge && now >= challenge.expiresAt;

  async function send(event) {
    event?.preventDefault();
    if (wait) return;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.trim().length > 254
    ) {
      setInvalid("email");
      emailInput.current?.focus();
      return;
    }
    const task = begin("send");
    if (!task) return;
    try {
      const flow = await learningRequest("flow", {
        language,
        signal: task.signal,
      });
      const response = await learningRequest("challenges", {
        method: "POST",
        body: { email: email.trim() },
        csrf: flow.csrfToken,
        language,
        signal: task.signal,
      });
      if (task.signal.aborted || !mounted.current) return;
      setFlowCsrf(flow.csrfToken);
      setCode("");
      setNow(Date.now());
      setChallenge({
        id: response.challengeId,
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
        resendAt: Date.now() + response.resendAfterSeconds * 1000,
      });
    } catch (failure) {
      if (!task.signal.aborted && mounted.current) recordError(failure);
    } finally {
      finish(task);
    }
  }

  async function verify(event) {
    event.preventDefault();
    if (wait || expired) return;
    if (!code.trim() || code.trim().length > 64) {
      setInvalid("code");
      codeInput.current?.focus();
      return;
    }
    const task = begin("verify");
    if (!task) return;
    try {
      await learningRequest(`challenges/${challenge.id}/verify`, {
        method: "POST",
        body: { code: code.trim() },
        csrf: flowCsrf,
        language,
        signal: task.signal,
      });
      // A 204 is verification success, not a training entitlement. Read the restricted session/list.
      const info = await learningRequest("session", {
        language,
        signal: task.signal,
      });
      const data = learnerPurchasePage(
        await learningRequest("trainings?page=0&size=20", {
          language,
          signal: task.signal,
        }),
      );
      if (task.signal.aborted || !mounted.current) return;
      setSession(info);
      setLibrary(data);
      setPage(0);
      setAuthOpen(false);
      setChallenge(null);
      setCode("");
      setEmail("");
      setFlowCsrf("");
      setRetryAt(0);
      title.current?.focus({ preventScroll: true });
    } catch (failure) {
      if (!task.signal.aborted && mounted.current) recordError(failure);
    } finally {
      finish(task);
    }
  }

  async function resend() {
    if (wait || resendWait) return;
    if (expired) return send();
    const task = begin("resend");
    if (!task) return;
    try {
      const response = await learningRequest(
        `challenges/${challenge.id}/resend`,
        { method: "POST", csrf: flowCsrf, language, signal: task.signal },
      );
      if (task.signal.aborted || !mounted.current) return;
      setCode("");
      setNow(Date.now());
      setChallenge({
        id: response.challengeId,
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
        resendAt: Date.now() + response.resendAfterSeconds * 1000,
      });
    } catch (failure) {
      if (!task.signal.aborted && mounted.current) recordError(failure);
    } finally {
      finish(task);
    }
  }

  async function changePage(next) {
    const task = begin("page");
    if (!task) return;
    try {
      const data = learnerPurchasePage(
        await learningRequest(`trainings?page=${next}&size=20`, {
          language,
          signal: task.signal,
        }),
      );
      if (task.signal.aborted || !mounted.current) return;
      setLibrary(data);
      setPage(next);
    } catch (failure) {
      if (!task.signal.aborted && mounted.current) {
        if (failure.status === 401) dropRecovered();
        recordError(failure);
      }
    } finally {
      finish(task);
    }
  }

  async function endSession() {
    const task = begin("end");
    if (!task) return;
    try {
      if (session)
        await learningRequest("session", {
          method: "DELETE",
          csrf: session.csrfToken,
          language,
          signal: task.signal,
        });
      if (task.signal.aborted || !mounted.current) return;
      clear();
      dropRecovered();
      setSelection(null);
      views.current.clear();
      setChallenge(null);
      setCode("");
      setEmail("");
      setFlowCsrf("");
      setAuthOpen(false);
      setNotice("sessionEnded");
    } catch (failure) {
      if (!task.signal.aborted && mounted.current) {
        if (failure.status === 401) {
          dropRecovered();
          setNotice("sessionExpired");
        } else recordError(failure);
      }
    } finally {
      finish(task);
    }
  }

  const needsForm = authOpen || (!session && !purchases.length);
  return (
    <main className="commerce-page commerce-ui learning-page" lang={language}>
      <div className="commerce-shell">
        <header className="learning-shell-header">
          <Link
            href={returnPath || "/learning"}
            className="brand"
            prefetch={false}
          >
            <span className="brand-mark" aria-hidden="true" />
            <strong>Fondeka Commerce</strong>
          </Link>
          <div className="learning-shell-controls">
            <label className="learning-language">
              <span className="sr-only">
                {language === "fr" ? "Langue" : "Language"}
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>
            </label>
            {(session || recent.length > 0) && (
              <button
                type="button"
                className="learning-end-session"
                onClick={() => void endSession()}
                disabled={!!busy}
              >
                {busy === "end" ? c.ending : c.end}
              </button>
            )}
          </div>
        </header>
        {returnPath && (
          <Link
            href={returnPath}
            className="commerce-text-button learning-back-store"
            prefetch={false}
          >
            <CommerceIcon name="back" size={18} />
            {c.backStore}
          </Link>
        )}
        {selected ? (
          <LearningPlayer
            key={`${selected.key}:${selected.origin}`}
            purchase={selected}
            language={language}
            copy={c}
            onBack={backToLibrary}
            onRecover={recover}
          />
        ) : (
          <>
            <header className="learning-heading">
              <span className="commerce-icon-tile commerce-icon-tile--violet">
                <CommerceIcon name="book" size={26} />
              </span>
              <div>
                <h1 ref={title} tabIndex={-1}>
                  {c.title}
                </h1>
                <p>{c.intro}</p>
              </div>
              {session && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={!!busy}
                  onClick={() => void restore()}
                >
                  <CommerceIcon name="refresh" size={18} />
                  {c.refresh}
                </button>
              )}
            </header>
            {notice && (
              <p className="learning-action-notice" role="status">
                {c[notice]}
              </p>
            )}
            {initialLoading ? (
              <LearningSkeleton copy={c} />
            ) : (
              <>
                {error && !needsForm && (
                  <LearningFeedback
                    error={error}
                    copy={c}
                    retry={() => void restore()}
                  />
                )}
                {needsForm ? (
                  <section className="learning-recovery">
                    <div className="learning-recovery-story">
                      <span className="learning-story-icon">
                        <CommerceIcon name="book" size={34} />
                      </span>
                      <h2>{c.verifyTitle}</h2>
                      <p>{c.verifyIntro}</p>
                      <div className="learning-privacy-note">
                        <CommerceIcon name="shield" size={21} />
                        <span>{c.privacy}</span>
                      </div>
                      {purchases.length > 0 && (
                        <button
                          type="button"
                          className="commerce-text-button"
                          onClick={() => {
                            setAuthOpen(false);
                            setChallenge(null);
                            setCode("");
                            setError(null);
                          }}
                        >
                          {c.backLibrary}
                          <CommerceIcon name="arrow" size={17} />
                        </button>
                      )}
                    </div>
                    <div className="learning-recovery-form">
                      <div className="learning-verification-progress">
                        <span>
                          {language === "fr"
                            ? `Étape ${challenge ? 2 : 1} sur 2`
                            : `Step ${challenge ? 2 : 1} of 2`}
                        </span>
                        <progress
                          max={2}
                          value={challenge ? 2 : 1}
                          aria-label={c.verificationProgress}
                        />
                      </div>
                      <h2>{challenge ? c.codeTitle : c.email}</h2>
                      <p>{challenge ? c.codeIntro : c.emailHint}</p>
                      <form onSubmit={challenge ? verify : send} noValidate>
                        {challenge ? (
                          <div className="commerce-field">
                            <label htmlFor="learning-code">{c.code}</label>
                            <input
                              ref={codeInput}
                              id="learning-code"
                              autoComplete="one-time-code"
                              inputMode="numeric"
                              value={code}
                              onChange={(event) => {
                                setCode(event.target.value);
                                setInvalid("");
                              }}
                              maxLength={64}
                              aria-invalid={invalid === "code"}
                              aria-describedby={
                                invalid === "code"
                                  ? "learning-code-error"
                                  : "learning-code-help"
                              }
                              disabled={!!busy}
                            />
                            <small id="learning-code-help">{c.codeHint}</small>
                            {invalid === "code" && (
                              <span
                                className="field-error"
                                id="learning-code-error"
                              >
                                {c.codeInvalid}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="commerce-field">
                            <label htmlFor="learning-email">{c.email}</label>
                            <input
                              ref={emailInput}
                              id="learning-email"
                              type="email"
                              autoComplete="email"
                              autoCapitalize="none"
                              spellCheck={false}
                              value={email}
                              onChange={(event) => {
                                setEmail(event.target.value);
                                setInvalid("");
                              }}
                              maxLength={254}
                              aria-invalid={invalid === "email"}
                              aria-describedby={
                                invalid === "email"
                                  ? "learning-email-error"
                                  : undefined
                              }
                              disabled={!!busy}
                            />
                            {invalid === "email" && (
                              <span
                                className="field-error"
                                id="learning-email-error"
                              >
                                {c.emailInvalid}
                              </span>
                            )}
                          </div>
                        )}
                        {expired && (
                          <p className="learning-field-notice" role="status">
                            {c.codeExpired}
                          </p>
                        )}
                        {error && (
                          <p className="learning-form-error" role="alert">
                            {learningError(error, c)}
                          </p>
                        )}
                        <button
                          type="submit"
                          className="button primary learning-verify-button"
                          disabled={!!busy || wait > 0 || Boolean(expired)}
                        >
                          {busy === "send"
                            ? c.sending
                            : busy === "verify"
                              ? c.verifying
                              : wait > 0
                                ? format(c.resendIn, { seconds: wait })
                                : challenge
                                  ? c.verify
                                  : c.sendCode}
                          <CommerceIcon name="arrow" size={18} />
                        </button>
                      </form>
                      {challenge && (
                        <div className="learning-code-actions">
                          <button
                            type="button"
                            className="commerce-text-button"
                            disabled={!!busy || resendWait > 0 || wait > 0}
                            onClick={() => void resend()}
                          >
                            {expired
                              ? c.sendCode
                              : resendWait > 0
                                ? format(c.resendIn, { seconds: resendWait })
                                : c.resend}
                          </button>
                          <button
                            type="button"
                            className="commerce-text-button"
                            disabled={!!busy}
                            onClick={() => {
                              setChallenge(null);
                              setCode("");
                              setFlowCsrf("");
                              setError(null);
                              setInvalid("");
                              window.requestAnimationFrame(() =>
                                emailInput.current?.focus(),
                              );
                            }}
                          >
                            {c.changeEmail}
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                ) : (
                  <>
                    <div className="learning-library-toolbar">
                      <div>
                        <span className="learning-eyebrow">
                          {session ? c.verified : c.activePurchase}
                        </span>
                        {!session && <p>{c.activePurchaseHelp}</p>}
                      </div>
                      <button
                        type="button"
                        className="commerce-text-button"
                        onClick={recover}
                      >
                        {c.anotherPurchase}
                        <CommerceIcon name="arrow" size={17} />
                      </button>
                    </div>
                    {purchases.length ? (
                      <div className="learning-library-grid">
                        {purchases.map((purchase) => (
                          <article
                            className="learning-library-card"
                            key={purchase.key}
                          >
                            <div
                              className="learning-library-art"
                              aria-hidden="true"
                            >
                              <CommerceIcon name="book" size={43} />
                              <span />
                            </div>
                            <div className="learning-library-body">
                              <p className="learning-eyebrow">
                                {c.order} {purchase.reference}
                              </p>
                              <h2>{purchase.title}</h2>
                              <button
                                type="button"
                                className="button primary"
                                onClick={() => select(purchase)}
                              >
                                {c.start}
                                <CommerceIcon name="arrow" size={18} />
                              </button>
                              <a
                                className="learning-secure-link"
                                href={purchase.playerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                              >
                                {c.securePlayer}
                                <CommerceIcon name="share" size={15} />
                              </a>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="learning-empty">
                        <CommerceIcon name="book" size={36} />
                        <h2>{c.emptyTitle}</h2>
                        <p>{c.emptyHelp}</p>
                        <button
                          type="button"
                          className="button primary"
                          onClick={recover}
                        >
                          {c.changeEmail}
                        </button>
                      </div>
                    )}
                    {session && library.totalPages > 1 && (
                      <nav className="learning-pagination" aria-label={c.title}>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={!!busy || page === 0}
                          onClick={() => void changePage(page - 1)}
                        >
                          {c.previous}
                        </button>
                        <span>
                          {format(c.page, {
                            page: page + 1,
                            pages: library.totalPages,
                          })}
                        </span>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={!!busy || page + 1 >= library.totalPages}
                          onClick={() => void changePage(page + 1)}
                        >
                          {c.next}
                        </button>
                      </nav>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
