export type SearchResult = {
  sentence: string;
  context?: string[];
  source: string;
  sourceUrl: string | null;
  isFallback?: boolean;
  fallbackWord?: string;
};

export type SearchSideState =
  | { status: "found"; result: SearchResult }
  | { status: "empty" }
  | { status: "error"; message: string };

export type SearchResponse = {
  query: string;
  science: SearchSideState;
  fantasy: SearchSideState;
  cached: boolean;
};