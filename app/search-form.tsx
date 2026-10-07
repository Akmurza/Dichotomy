"use client";

import { Fragment, FormEvent, useEffect, useState, type CSSProperties } from "react";
import { getDeviceId } from "@/lib/device-id";
import type { SearchResponse, SearchResult, SearchSideState } from "@/lib/search-types";

type ResultCardState = SearchSideState | { status: "loading" };

type PhotoMotion = "idle" | "breaking" | "reassembled";
type SavedState = "checking" | "saved" | "unsaved" | "saving" | "error";
type SavedItem = { query: string };

export default function SearchForm({ onPhotoMotion }: { onPhotoMotion: (motion: PhotoMotion) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [motion, setMotion] = useState<"idle" | "dissolve" | "reveal">("idle");
  const [savedState, setSavedState] = useState<SavedState>("checking");
  useEffect(() => {
    try {
      getDeviceId();
    } catch (deviceIdError) {
      console.warn("Could not initialize the device ID:", deviceIdError);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const previousSavedState = savedState;
    setLoading(true);
    setSavedState("checking");
    onPhotoMotion("breaking");
    setError("");
    if (result) setMotion("dissolve");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, refresh: Boolean(result) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      onPhotoMotion("reassembled");
      if (!result) {
        setResult(data);
        void refreshSavedState(data);
        setMotion("reveal");
        window.setTimeout(() => setMotion("idle"), 900);
      } else {
        window.setTimeout(() => {
          setResult(data);
          void refreshSavedState(data);
          setMotion("reveal");
          window.setTimeout(() => setMotion("idle"), 1200);
        }, 850);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed.");
      setSavedState(
        previousSavedState === "saved" || previousSavedState === "unsaved"
          ? previousSavedState
          : "error",
      );
      setMotion("idle");
      onPhotoMotion("idle");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSavedState(searchResult: SearchResponse) {
    setSavedState("checking");
    try {
      const response = await fetch(`/api/saved?deviceId=${encodeURIComponent(getDeviceId())}`);
      const data = await response.json() as { items?: SavedItem[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not check saved items.");
      const normalizedQuery = searchResult.query.trim().toLocaleLowerCase();
      const matchingItem = data.items?.find(
        (item) => item.query.trim().toLocaleLowerCase() === normalizedQuery,
      );
      setSavedState(matchingItem ? "saved" : "unsaved");
    } catch (requestError) {
      setSavedState("error");
      setError(requestError instanceof Error ? requestError.message : "Could not check saved items.");
    }
  }

  async function savePair() {
    if (
      !result
      || result.science.status !== "found"
      || result.fantasy.status !== "found"
      || savedState === "saved"
    ) return;

    setSavedState("saving");
    setError("");
    try {
      const response = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          query: result.query,
          science: result.science.result,
          fantasy: result.fantasy.result,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update saved items.");
      setSavedState("saved");
    } catch (requestError) {
      setSavedState("unsaved");
      setError(requestError instanceof Error ? requestError.message : "Could not update saved items.");
    }
  }

  const canSavePair = result?.science.status === "found" && result.fantasy.status === "found";

  function saveButton() {
    return (
      <div className="save-pair-row">
        <button
          className="save-pair-button"
          type="button"
          onClick={() => savedState === "error" && result ? void refreshSavedState(result) : void savePair()}
          disabled={savedState === "checking" || savedState === "saving" || savedState === "saved"}
          aria-pressed={savedState === "saved"}
        >
          {savedState === "checking" ? "Checking..."
            : savedState === "saving" ? "Saving..."
              : savedState === "saved" ? "Saved ✓"
                : savedState === "error" ? "Retry status"
                  : "Save pair"}
        </button>
      </div>
    );
  }

  return (
    <>
      <form className="search-form" onSubmit={handleSubmit}>
        <label htmlFor="word">Enter a word or short phrase</label>
        <div className="search-row">
          <input id="word" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="try: twist" />
          <button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {result && motion !== "idle" && <span className={`site-blackout is-${motion}`} aria-hidden="true" />}
      {(result || loading) && (
        <section
          className={`results ${motion !== "idle" ? `is-${motion}` : ""}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <ResultCard
            title="Science"
            query={result?.query ?? query}
            state={loading ? { status: "loading" } : result?.science ?? { status: "empty" }}
            type="science"
          />
          <ResultCard
            title="Fantasy / RPG"
            query={result?.query ?? query}
            state={loading ? { status: "loading" } : result?.fantasy ?? { status: "empty" }}
            type="fantasy"
          />
          {canSavePair && saveButton()}
          {motion !== "idle" && <span className="word-substance" aria-hidden="true" />}
        </section>
      )}
    </>
  );
}

function ResultCard({
  title,
  query,
  state,
  type,
}: {
  title: string;
  query: string;
  state: ResultCardState;
  type: "science" | "fantasy";
}) {
  if (state.status === "loading") {
    return (
      <article className={`result-card result-${type}`} aria-busy="true">
        <p className="card-label">{title}</p>
        <p className="result-state" role="status">Searching {title.toLowerCase()}...</p>
      </article>
    );
  }

  if (state.status === "empty") {
    return (
      <article className={`result-card result-${type}`}>
        <p className="card-label">{title}</p>
        <p className="result-state">No {title.toLowerCase()} result found for &ldquo;{query}&rdquo;.</p>
      </article>
    );
  }

  if (state.status === "error") {
    return (
      <article className={`result-card result-${type}`}>
        <p className="card-label">{title}</p>
        <p className="result-state" role="alert">{state.message}</p>
      </article>
    );
  }

  return <FoundResultCard title={title} result={state.result} type={type} />;
}

function FoundResultCard({ title, result, type }: { title: string; result: SearchResult; type: "science" | "fantasy" }) {
  return (
    <article className={`result-card result-${type}`}>
      <p className="card-label">{title}</p>
      <blockquote>
        “{type === "fantasy"
          ? result.sentence.split(" ").map((word, index) => (
            <Fragment key={`${word}-${index}`}>
              {index > 0 && " "}
              <span className="fragment" style={{ "--fragment-index": index } as CSSProperties}>{word}</span>
            </Fragment>
          ))
          : result.sentence}”
      </blockquote>
      <p className="source">{result.source}</p>
      {result.isFallback && <p className="fallback">Matched through a related word.</p>}
    </article>
  );
}
