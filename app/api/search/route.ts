import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

const OPENALEX_API_URL = "https://api.openalex.org/works";

type SearchResult = {
  sentence: string;
  source: string;
  sourceUrl: string | null;
  isFallback?: boolean;
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

function sentenceContaining(text: string, query: string): string | null {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const normalizedQuery = query.toLocaleLowerCase();
  const exact = sentences.find((sentence) => sentence.toLocaleLowerCase().includes(normalizedQuery));
  if (exact) return exact.trim();

  const firstWord = query.split(/\s+/)[0]?.toLocaleLowerCase();
  return sentences.find((sentence) => sentence.toLocaleLowerCase().includes(firstWord))?.trim() ?? null;
}

async function fetchScience(query: string): Promise<SearchResult | null> {
  const params = new URLSearchParams({
    search: query,
    filter: "has_abstract:true",
    "per-page": "10",
    select: "title,publication_year,doi,abstract_inverted_index,primary_location",
  });
  const response = await fetch(`${OPENALEX_API_URL}?${params}`, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`OpenAlex request failed with ${response.status}.`);

  const payload = (await response.json()) as OpenAlexResponse;
  for (const work of payload.results ?? []) {
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const sentence = sentenceContaining(abstract, query);
    if (!sentence) continue;

    const sourceName = work.primary_location?.source?.display_name ?? "OpenAlex work";
    const year = work.publication_year ? ` (${work.publication_year})` : "";
    return {
      sentence,
      source: `${work.title ?? sourceName} - ${sourceName}${year}`,
      sourceUrl: work.primary_location?.landing_page_url ?? work.doi ?? null,
    };
  }
  return null;
}

async function fetchFantasy(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, query: string): Promise<SearchResult | null> {
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
    .select("sentence, source_title, source_author, source_url")
    .textSearch("content_tsv", query, { type: "websearch", config: "english" })
    .limit(10);
  if (error) throw new Error(`Fantasy search failed: ${error.message}`);

  const entry = data?.[Math.floor(Math.random() * data.length)];
  if (!entry) return null;
  const attribution = entry.source_author
    ? `${entry.source_author}, ${entry.source_title}`
    : entry.source_title;
  const result = {
    sentence: entry.sentence,
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

  if (!query) {
    return NextResponse.json({ error: "Enter a word or short phrase." }, { status: 400 });
  }

  const normalizedQuery = query.toLocaleLowerCase();
  const supabase = await createSupabaseServerClient();
  let cached;
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
    const message = error instanceof Error ? error.message : "Cache lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (cached?.science_result && cached.fantasy_result) {
    if (normalizedQuery === "dragon") {
      console.log("Fantasy result for dragon (cache):", JSON.stringify(cached.fantasy_result));
    }
    return NextResponse.json({
      query,
      science: cached.science_result,
      fantasy: cached.fantasy_result,
      cached: true,
    });
  }

  try {
    const [science, fantasy] = await Promise.all([
      fetchScience(query),
      fetchFantasy(supabase, query),
    ]);
    if (!science || !fantasy) {
      return NextResponse.json(
        { error: `No complete science and fantasy match found for "${query}".` },
        { status: 404 },
      );
    }

    try {
      await withCacheRetry(async () => {
        const { error } = await supabase.from("search_cache").upsert({
          query: normalizedQuery,
          science_result: science,
          fantasy_result: fantasy,
          updated_at: new Date().toISOString(),
        }, { onConflict: "query" });
        if (error) throw new Error(`Cache write failed: ${error.message}`);
      }, "write");
    } catch (error) {
      console.warn("Search cache write failed after retries:", error);
    }

    return NextResponse.json({ query, science, fantasy, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
