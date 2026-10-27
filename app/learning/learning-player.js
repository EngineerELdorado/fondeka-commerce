"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CommerceIcon, DialogBackdrop } from "../commerce-ui";
import { learningRequest } from "../../lib/learning-client";
import {
  learnerCurriculum,
  learnerMaterialAccess,
  youtubeDestination,
} from "../../lib/public-learning.mjs";
import { learningError } from "../../lib/learning-copy";

const format = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
const denied = (error) =>
  error?.status === 401 ||
  error?.status === 403 ||
  error?.status === 404 ||
  error?.code === "INVALID_RESPONSE";
const payloadError = () =>
  Object.assign(new Error("Invalid learning response"), {
    code: "INVALID_RESPONSE",
    status: 502,
  });

export function LearningFeedback({ error, copy, retry, children }) {
  return (
    <div className="learning-feedback" role="alert">
      <CommerceIcon name="shield" size={22} />
      <div>
        <p>{learningError(error, copy)}</p>
        {retry && (
          <button
            type="button"
            className="commerce-text-button"
            onClick={retry}
          >
            {copy.retry}
            <CommerceIcon name="arrow" size={16} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function LearningSkeleton({ copy }) {
  return (
    <div className="learning-skeleton" role="status" aria-label={copy.loading}>
      <span className="commerce-skeleton" />
      <span className="commerce-skeleton" />
      <span className="commerce-skeleton" />
      <span className="sr-only">{copy.loading}</span>
    </div>
  );
}

export default function LearningPlayer({
  purchase,
  language,
  copy: c,
  onBack,
  onRecover,
}) {
  const [curriculum, setCurriculum] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(null);
  const [showOrder, setShowOrder] = useState(false);
  const courseTask = useRef(null);
  const writeTask = useRef(null);
  const alive = useRef(true);
  const heading = useRef(null);
  const outline = useRef(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  const loseAccess = useCallback((failure) => {
    setError(failure);
    if (denied(failure)) {
      setCurriculum(null);
      setOpening(null);
      setSelectedId(null);
    }
  }, []);

  const load = useCallback(
    async (initial = false) => {
      courseTask.current?.abort();
      const task = new AbortController();
      courseTask.current = task;
      setError(null);
      if (initial) {
        setCurriculum(null);
        setSelectedId(null);
        setOpening(null);
        setLoading(true);
      } else setRefreshing(true);
      try {
        const data = learnerCurriculum(
          await learningRequest("course", {
            method: "POST",
            body: { accessUrl: purchase.accessUrl },
            language: languageRef.current,
            signal: task.signal,
          }),
        );
        if (data.productId !== purchase.productId) throw payloadError();
        if (task.signal.aborted || !alive.current) return false;
        setCurriculum(data);
        setStale(false);
        setSelectedId((current) =>
          initial
            ? data.nextMaterialId
            : data.modules.some((module) =>
                  module.materials.some((material) => material.id === current),
                )
              ? current
              : null,
        );
        return true;
      } catch (failure) {
        if (!task.signal.aborted && alive.current) {
          loseAccess(failure);
          setStale(true);
        }
        return false;
      } finally {
        if (courseTask.current === task) courseTask.current = null;
        if (!task.signal.aborted && alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [purchase.accessUrl, purchase.productId, loseAccess],
  );

  useEffect(() => {
    alive.current = true;
    void load(true);
    const refreshOnReturn = () => {
      if (!document.hidden && !writeTask.current && !courseTask.current)
        void load();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      alive.current = false;
      courseTask.current?.abort();
      writeTask.current?.abort();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [load]);

  useEffect(() => {
    if (selectedId) heading.current?.focus({ preventScroll: true });
  }, [selectedId]);

  const select = (id) => {
    setSelectedId(id);
    setOpening(null);
    setNotice("");
    if (window.matchMedia("(max-width: 760px)").matches)
      window.requestAnimationFrame(() =>
        heading.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        }),
      );
  };
  const material = curriculum?.modules
    .flatMap((module) => module.materials)
    .find((item) => item.id === selectedId);

  async function complete() {
    if (!material || writeTask.current || stale) return;
    const task = new AbortController();
    writeTask.current = task;
    setBusy(true);
    setError(null);
    setNotice("");
    setOpening(null);
    try {
      await learningRequest("progress", {
        method: "POST",
        body: {
          accessUrl: purchase.accessUrl,
          materialId: material.id,
          completed: !material.completed,
        },
        language,
        signal: task.signal,
      });
      if (task.signal.aborted || !alive.current) return;
      const fresh = await load();
      if (!alive.current || task.signal.aborted) return;
      setNotice(fresh ? "saved" : "refreshRequired");
    } catch (failure) {
      if (!task.signal.aborted && alive.current) loseAccess(failure);
    } finally {
      if (writeTask.current === task) writeTask.current = null;
      if (alive.current) setBusy(false);
    }
  }

  if (showOrder)
    return (
      <OrderStatus
        purchase={purchase}
        language={language}
        copy={c}
        onBack={() => setShowOrder(false)}
        onLibrary={onBack}
      />
    );

  return (
    <section className="learning-player">
      <div className="learning-page-actions">
        <button
          type="button"
          className="commerce-text-button"
          onClick={onBack}
          disabled={busy}
        >
          <CommerceIcon name="back" size={18} />
          {c.backLibrary}
        </button>
        <a
          className="learning-secure-link"
          href={purchase.playerUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          {c.securePlayer}
          <CommerceIcon name="share" size={16} />
        </a>
      </div>
      <header className="learning-heading">
        <span className="commerce-icon-tile commerce-icon-tile--violet">
          <CommerceIcon name="book" size={24} />
        </span>
        <div>
          <p className="learning-eyebrow">{c.curriculum}</p>
          <h1>{curriculum?.title || purchase.title}</h1>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy || loading || refreshing}
          onClick={() => {
            setNotice("");
            void load();
          }}
        >
          <CommerceIcon name="refresh" size={18} />
          {refreshing ? c.loading : c.refresh}
        </button>
      </header>
      {error && (
        <LearningFeedback
          error={error}
          copy={c}
          retry={error.status === 404 ? undefined : () => void load()}
        >
          {error.status === 403 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowOrder(true)}
            >
              {c.backOrder}
            </button>
          )}
          {error.status === 401 && (
            <button
              type="button"
              className="button secondary"
              onClick={onRecover}
            >
              {c.signInAgain}
            </button>
          )}
        </LearningFeedback>
      )}
      {loading ? (
        <LearningSkeleton copy={c} />
      ) : (
        curriculum && (
          <>
            <section className="learning-progress-card" aria-label={c.progress}>
              <div>
                <strong>{curriculum.progressPercentage}%</strong>
                <span>
                  {format(c.progressText, {
                    completed: curriculum.completedMaterials,
                    total: curriculum.totalMaterials,
                  })}
                </span>
                <progress
                  max={100}
                  value={curriculum.progressPercentage}
                  aria-label={c.progress}
                />
              </div>
              <button
                type="button"
                className="button primary"
                disabled={busy || refreshing}
                onClick={() =>
                  curriculum.nextMaterialId
                    ? select(curriculum.nextMaterialId)
                    : outline.current?.scrollIntoView({
                        block: "start",
                        behavior: "instant",
                      })
                }
              >
                {curriculum.nextMaterialId ? c.continue : c.browse}
                <CommerceIcon
                  name={curriculum.nextMaterialId ? "arrow" : "book"}
                  size={18}
                />
              </button>
            </section>
            {curriculum.totalMaterials > 0 &&
              curriculum.progressPercentage === 100 && (
                <div className="learning-completed-banner">
                  <CommerceIcon name="check" size={20} />
                  <div>
                    <strong>{c.completeTitle}</strong>
                    <p>{c.completeHelp}</p>
                  </div>
                </div>
              )}
            {!curriculum.modules.length ? (
              <div className="learning-empty">
                <CommerceIcon name="book" size={36} />
                <h2>{c.noMaterials}</h2>
                <p>{c.noMaterialsHelp}</p>
              </div>
            ) : (
              <div className="learning-workspace">
                <aside
                  className="learning-outline"
                  ref={outline}
                  aria-label={c.curriculum}
                >
                  <h2>
                    {c.curriculum}
                    <span>
                      {curriculum.modules.length} {c.modules}
                    </span>
                  </h2>
                  {curriculum.modules.map((module, index) => (
                    <details className="learning-module" key={module.id} open>
                      <summary>
                        <span className="learning-module-number">
                          {index + 1}
                        </span>
                        <strong>{module.title}</strong>
                        <CommerceIcon name="chevron" size={18} />
                      </summary>
                      {module.description && (
                        <p className="learning-module-description">
                          {module.description}
                        </p>
                      )}
                      <ol>
                        {module.materials.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`learning-material-row${item.id === selectedId ? " is-selected" : ""}`}
                              aria-current={
                                item.id === selectedId ? "step" : undefined
                              }
                              onClick={() => select(item.id)}
                              disabled={busy}
                            >
                              <span
                                className={`learning-material-state${item.completed ? " is-completed" : ""}`}
                              >
                                <CommerceIcon
                                  name={
                                    item.completed
                                      ? "check"
                                      : item.type === "FILE"
                                        ? "file"
                                        : item.linkProvider === "YOUTUBE"
                                          ? "play"
                                          : "link"
                                  }
                                  size={17}
                                />
                              </span>
                              <span>
                                <strong>{item.title}</strong>
                                <small>
                                  {item.linkProvider === "YOUTUBE"
                                    ? c.youtube
                                    : item.type === "FILE"
                                      ? c.file
                                      : c.link}
                                  {item.completed ? ` · ${c.completed}` : ""}
                                </small>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ))}
                </aside>
                <section
                  className="learning-lesson"
                  aria-label={material?.title || c.selectTitle}
                >
                  {material ? (
                    <>
                      <div className="learning-lesson-type">
                        <CommerceIcon
                          name={
                            material.type === "FILE"
                              ? "file"
                              : material.linkProvider === "YOUTUBE"
                                ? "play"
                                : "link"
                          }
                          size={16}
                        />
                        {material.linkProvider === "YOUTUBE"
                          ? c.youtube
                          : material.type === "FILE"
                            ? c.file
                            : c.link}
                      </div>
                      <h2 ref={heading} tabIndex={-1}>
                        {material.title}
                      </h2>
                      {material.description && (
                        <div className="learning-notes">
                          <h3>{c.notes}</h3>
                          <p>{material.description}</p>
                        </div>
                      )}
                      <button
                        className={`learning-open-card${material.linkProvider === "YOUTUBE" ? " learning-open-card--youtube" : ""}`}
                        type="button"
                        disabled={busy}
                        onClick={() => setOpening(material)}
                      >
                        <span className="learning-open-icon">
                          <CommerceIcon
                            name={
                              material.linkProvider === "YOUTUBE"
                                ? "play"
                                : material.type === "FILE"
                                  ? "file"
                                  : "link"
                            }
                            size={27}
                          />
                        </span>
                        <span>
                          <strong>
                            {material.linkProvider === "YOUTUBE"
                              ? c.watch
                              : material.type === "FILE"
                                ? c.openFile
                                : c.openMaterial}
                          </strong>
                          <small>
                            {material.linkProvider === "YOUTUBE"
                              ? c.youtubeHelp
                              : material.type === "FILE"
                                ? c.fileHelp
                                : c.linkHelp}
                          </small>
                        </span>
                        <CommerceIcon name="arrow" size={20} />
                      </button>
                      <div className="learning-completion-control">
                        <button
                          type="button"
                          className={`button ${material.completed ? "secondary" : "primary"}`}
                          aria-pressed={material.completed}
                          disabled={busy || stale || refreshing}
                          onClick={() => void complete()}
                        >
                          <CommerceIcon name="check" size={18} />
                          {busy
                            ? c.saving
                            : material.completed
                              ? c.completed
                              : c.markComplete}
                        </button>
                        <p>{c.completionHelp}</p>
                      </div>
                      {notice && (
                        <p className="learning-action-notice" role="status">
                          {c[notice]}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="learning-empty">
                      <CommerceIcon name="book" size={36} />
                      <h2 ref={heading} tabIndex={-1}>
                        {c.selectTitle}
                      </h2>
                      <p>{c.selectHelp}</p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )
      )}
      {opening && (
        <MaterialDialog
          key={opening.id}
          purchase={purchase}
          material={opening}
          language={language}
          copy={c}
          onClose={() => setOpening(null)}
          onDenied={(failure) => {
            if (failure.status === 401 || failure.status === 403)
              loseAccess(failure);
          }}
        />
      )}
    </section>
  );
}

function MaterialDialog({
  purchase,
  material,
  language,
  copy: c,
  onClose,
  onDenied,
}) {
  const [access, setAccess] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const deniedRef = useRef(onDenied);
  deniedRef.current = onDenied;
  useEffect(() => {
    const task = new AbortController();
    setLoading(true);
    setError(null);
    setAccess(null);
    learningRequest("material", {
      method: "POST",
      body: { accessUrl: purchase.accessUrl, materialId: material.id },
      language,
      signal: task.signal,
    })
      .then((data) => {
        const safe = learnerMaterialAccess(data, material.id);
        if (safe.type !== material.type) throw payloadError();
        if (!task.signal.aborted) setAccess(safe);
      })
      .catch((failure) => {
        if (!task.signal.aborted) {
          setError(failure);
          deniedRef.current(failure);
        }
      })
      .finally(() => {
        if (!task.signal.aborted) setLoading(false);
      });
    return () => task.abort();
  }, [purchase.accessUrl, material.id, material.type, language, attempt]);
  useEffect(() => {
    if (!access?.expiresAt) return;
    const timeout = setTimeout(
      () => {
        setAccess(null);
        setError(
          Object.assign(new Error("Expired access"), {
            code: "ACCESS_EXPIRED",
            status: 410,
          }),
        );
      },
      Math.max(0, Date.parse(access.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [access]);
  const youtube =
    material.linkProvider === "YOUTUBE" ||
    (access?.type === "LINK" && youtubeDestination(access.url));
  return (
    <DialogBackdrop
      className="learning-dialog-backdrop"
      label={material.title}
      onClose={onClose}
    >
      <div
        className="learning-access-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <span className="commerce-icon-tile commerce-icon-tile--violet">
            <CommerceIcon
              name={
                youtube ? "play" : material.type === "FILE" ? "file" : "link"
              }
            />
          </span>
          <h2>{material.title}</h2>
          <button
            type="button"
            className="commerce-close-button"
            aria-label={c.close}
            onClick={onClose}
          >
            <CommerceIcon name="close" />
          </button>
        </header>
        {loading ? (
          <LearningSkeleton copy={{ loading: c.opening }} />
        ) : error ? (
          <div className="learning-feedback" role="alert">
            <p>{learningError(error, c, material.type === "FILE")}</p>
          </div>
        ) : (
          access && (
            <>
              <p>{access.fileName || c.materialReady}</p>
              <a
                className={`learning-open-card learning-access-link${youtube ? " learning-open-card--youtube" : ""}`}
                href={access.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                onClick={(event) => {
                  if (
                    access.expiresAt &&
                    Date.parse(access.expiresAt) <= Date.now()
                  ) {
                    event.preventDefault();
                    setAccess(null);
                    setError(
                      Object.assign(new Error("Expired access"), {
                        code: "ACCESS_EXPIRED",
                      }),
                    );
                  }
                }}
              >
                <span className="learning-open-icon">
                  <CommerceIcon
                    name={
                      youtube
                        ? "play"
                        : access.type === "FILE"
                          ? "file"
                          : "link"
                    }
                    size={28}
                  />
                </span>
                <span>
                  <strong>
                    {youtube
                      ? c.watch
                      : access.type === "FILE"
                        ? c.openFile
                        : c.openLink}
                  </strong>
                  <small>
                    {youtube
                      ? c.youtubeHelp
                      : access.type === "FILE"
                        ? c.fileHelp
                        : c.linkHelp}
                  </small>
                </span>
                <CommerceIcon name="share" size={18} />
              </a>
            </>
          )
        )}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            {c.close}
          </button>
          <button
            type="button"
            className="commerce-text-button"
            onClick={() => setAttempt((value) => value + 1)}
            disabled={loading}
          >
            <CommerceIcon name="refresh" size={17} />
            {c.freshAccess}
          </button>
        </footer>
      </div>
    </DialogBackdrop>
  );
}

function OrderStatus({ purchase, language, copy: c, onBack, onLibrary }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const task = new AbortController();
    setOrder(null);
    setError(null);
    learningRequest("order-status", {
      method: "POST",
      body: { accessUrl: purchase.accessUrl },
      language,
      signal: task.signal,
    })
      .then((data) => {
        if (
          data.reference !== purchase.reference ||
          typeof data.status !== "string" ||
          !data.status
        )
          throw payloadError();
        if (!task.signal.aborted) setOrder(data);
      })
      .catch((failure) => {
        if (!task.signal.aborted) setError(failure);
      });
    return () => task.abort();
  }, [purchase.accessUrl, purchase.reference, language, attempt]);
  return (
    <section className="learning-order-status">
      <button type="button" className="commerce-text-button" onClick={onBack}>
        <CommerceIcon name="back" size={18} />
        {c.backLibrary}
      </button>
      <div className="learning-empty">
        <span className="commerce-icon-tile">
          <CommerceIcon name="card" size={24} />
        </span>
        <h1>{c.paymentStatus}</h1>
        <p>{c.paymentHelp}</p>
        {error ? (
          <LearningFeedback
            error={error}
            copy={c}
            retry={() => setAttempt((value) => value + 1)}
          />
        ) : order ? (
          <div className="learning-order-summary">
            <span>
              {c.order} {order.reference}
            </span>
            <strong>{c.statuses[order.status] || order.status}</strong>
          </div>
        ) : (
          <LearningSkeleton copy={c} />
        )}
        <button type="button" className="button secondary" onClick={onLibrary}>
          {c.backLibrary}
        </button>
      </div>
    </section>
  );
}
