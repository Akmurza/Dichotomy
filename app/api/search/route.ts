import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { SearchResponse, SearchResult, SearchSideState } from "@/lib/search-types";
import { NextResponse } from "next/server";

const OPENALEX_API_URL = "https://api.openalex.org/works";
const DATAMUSE_API_URL = "https://api.datamuse.com/words";

type SeenPair = {
  science: { sentence: string; sourceUrl: string | null };
  fantasy: { sentence: string; sourceUrl: string | null };
};

type OpenAlexWork = {
  title?: string;
  publication_year?: number;
  doi?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null } | null;
  } | null;
};

type OpenAlexResponse = { results?: OpenAlexWork[] };

function toSideState(
  outcome: PromiseSettledResult<SearchResult | null>,
  source: "Science" | "Fantasy",
): SearchSideState {
  if (outcome.status === "rejected") {
    console.error(`${source} search failed:`, outcome.reason);
    return { status: "error", message: `${source} search is temporarily unavailable.` };
  }

  return outcome.value ? { status: "found", result: outcome.value } : { status: "empty" };
}

async function withCacheRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Search cache ${label} attempt ${attempt} failed:`, error);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Search cache ${label} failed.`);
}

function reconstructAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";

  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(" ");
}

function sentenceWindow(text: string, query: string): { sentence: string; context: string[] } | null {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const normalizedQuery = query.toLocaleLowerCase();
  const index = sentences.findIndex((sentence) => sentence.toLocaleLowerCase().includes(normalizedQuery));
  if (index >= 0) {
    return {
      sentence: sentences[index].trim(),
      context: sentences.slice(Math.max(0, index - 1), index + 2).map((item) => item.trim()),
    };
  }

  const firstWord = query.split(/\s+/)[0]?.toLocaleLowerCase();
  const fallbackIndex = sentences.findIndex((sentence) => sentence.toLocaleLowerCase().includes(firstWord));
  if (fallbackIndex < 0) return null;
  return {
    sentence: sentences[fallbackIndex].trim(),
    context: sentences.slice(Math.max(0, fallbackIndex - 1), fallbackIndex + 2).map((item) => item.trim()),
  };
}

async function fetchScience(query: string, seen: SeenPair[]): Promise<SearchResult | null> {
  const params = new URLSearchParams({
    search: query,
    filter: "has_abstract:true",
    "per-page": "10",
    select: "title,publication_year,doi,abstract_inverted_index,primary_location",
  });
  const response = await fetch(`${OPENALEX_API_URL}?${params}`, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`OpenAlex request failed with ${response.status}.`);

  const payload = (await response.json()) as OpenAlexResponse;
  const candidates: Array<{ work: OpenAlexWork; match: { sentence: string; context: string[] }; sourceUrl: string | null }> = [];
  for (const work of payload.results ?? []) {
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const match = sentenceWindow(abstract, query);
    if (!match) continue;
    const sourceUrl = work.primary_location?.landing_page_url ?? work.doi ?? null;
    candidates.push({ work, match, sourceUrl });
  }
  const unseen = candidates.filter(({ match, sourceUrl }) =>
    !seen.some((item) => item.science.sentence === match.sentence && item.science.sourceUrl === sourceUrl),
  );
  for (const { work, match, sourceUrl } of (unseen.length > 0 ? unseen : candidates)) {

    const sourceName = work.primary_location?.source?.display_name ?? "OpenAlex work";
    const year = work.publication_year ? ` (${work.publication_year})` : "";
    return {
      sentence: match.sentence,
      context: match.context,
      source: `${work.title ?? sourceName} - ${sourceName}${year}`,
      sourceUrl,
    };
  }
  return null;
}

async function fetchFantasy(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, query: string, seen: SeenPair[]): Promise<SearchResult | null> {
  const exact = await searchFantasyEntries(supabase, query, seen);
  if (exact) return exact;

  const synonymResponse = await fetch(`${DATAMUSE_API_URL}?rel_syn=${encodeURIComponent(query)}&max=5`, {
    next: { revalidate: 300 },
  });
  if (!synonymResponse.ok) return null;
  const synonyms = (await synonymResponse.json()) as Array<{ word?: string }>;
  for (const synonym of synonyms.map((item) => item.word).filter((word): word is string => Boolean(word))) {
    const fallback = await searchFantasyEntries(supabase, synonym, seen);
    if (fallback) return { ...fallback, isFallback: true, fallbackWord: synonym };
  }
  return null;
}

async function searchFantasyEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  query: string,
  seen: SeenPair[],
): Promise<SearchResult | null> {
  console.log("Fantasy textSearch:", {
    table: "rpg_entries",
    select: "sentence, source_title, source_author, source_url",
    column: "content_tsv",
    query,
    options: { type: "websearch", config: "english" },
    limit: 10,
  });
  const { data, error } = await supabase
    .from("rpg_entries")
    .select("sentence, context_before, context_after, source_title, source_author, source_url")
    .textSearch("content_tsv", query, { type: "websearch", config: "english" })
    .limit(25);
  if (error) throw new Error(`Fantasy search failed: ${error.message}`);

  const rows = data ?? [];
  const candidates = rows.filter((item) => !seen.some((seenItem) => seenItem.fantasy.sentence === item.sentence && seenItem.fantasy.sourceUrl === item.source_url));
  const pool = candidates.length > 0 ? candidates : rows;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  if (!entry) return null;
  const attribution = entry.source_author
    ? `${entry.source_author}, ${entry.source_title}`
    : entry.source_title;
  const result: SearchResult = {
    sentence: entry.sentence,
    context: [entry.context_before, entry.sentence, entry.context_after].filter((sentence): sentence is string => Boolean(sentence)),
    source: attribution,
    sourceUrl: entry.source_url,
    isFallback: false,
  };
  if (query.toLocaleLowerCase() === "dragon") {
    console.log("Fantasy result for dragon:", JSON.stringify(result));
  }
  return result;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const refresh = body && (body as { refresh?: unknown }).refresh === true;
  const seen = body && Array.isArray((body as { seen?: unknown }).seen)
    ? (body as { seen: SeenPair[] }).seen.filter((item) => typeof item?.science?.sentence === "string" && typeof item?.fantasy?.sentence === "string")
    : [];

  if (!query) {
    return NextResponse.json({ error: "Enter a word or short phrase." }, { status: 400 });
  }

  const normalizedQuery = query.toLocaleLowerCase();
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("Supabase client initialization failed:", error);
  }
  let cached: { science_result: SearchResult | null; fantasy_result: SearchResult | null } | null = null;
  if (supabase) {
    try {
      cached = await withCacheRetry(async () => {
        const { data, error } = await supabase
          .from("search_cache")
          .select("science_result, fantasy_result")
          .eq("query", normalizedQuery)
          .maybeSingle();
        if (error) throw new Error(`Cache lookup failed: ${error.message}`);
        return data;
      }, "read");
    } catch (error) {
      console.warn("Search cache read failed; continuing with live searches:", error);
    }
  }

  if (!refresh && seen.length === 0 && cached?.science_result && cached.fantasy_result) {
    if (normalizedQuery === "dragon") {
      console.log("Fantasy result for dragon (cache):", JSON.stringify(cached.fantasy_result));
    }
    const response: SearchResponse = {
      query,
      science: { status: "found", result: cached.science_result },
      fantasy: { status: "found", result: cached.fantasy_result },
      cached: true,
    };
    return NextResponse.json(response);
  }

  const fantasySearch = supabase
    ? fetchFantasy(supabase, query, seen)
    : Promise.reject(new Error("Supabase client is unavailable."));
  const [scienceOutcome, fantasyOutcome] = await Promise.allSettled([
    fetchScience(query, seen),
    fantasySearch,
  ]);
  const science = toSideState(scienceOutcome, "Science");
  const fantasy = toSideState(fantasyOutcome, "Fantasy");

  if (supabase && science.status === "found" && fantasy.status === "found") {
    try {
      await withCacheRetry(async () => {
        const { error } = await supabase.from("search_cache").upsert({
          query: normalizedQuery,
          science_result: science.result,
          fantasy_result: fantasy.result,
          updated_at: new Date().toISOString(),
        }, { onConflict: "query" });
        if (error) throw new Error(`Cache write failed: ${error.message}`);
      }, "write");
    } catch (error) {
      console.warn("Search cache write failed after retries:", error);
    }
  }

  const response: SearchResponse = { query, science, fantasy, cached: false };
  return NextResponse.json(response);
}
