import { setDefaultResultOrder } from "node:dns";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

setDefaultResultOrder("ipv4first");
loadEnv({ path: ".env.local" });
loadEnv();

const INSERT_BATCH_SIZE = 200;
const MIN_SENTENCE_LENGTH = 20;
const MAX_SENTENCE_LENGTH = 400;
const GUTENBERG_BOOKS = [
  { id: 2591, title: "Grimm's Fairy Tales", author: "Jacob and Wilhelm Grimm" },
  { id: 503, title: "The Blue Fairy Book", author: "Andrew Lang" },
  { id: 84, title: "Frankenstein", author: "Mary Shelley" },
  { id: 55, title: "The Wonderful Wizard of Oz", author: "L. Frank Baum" },
  { id: 11, title: "Alice's Adventures in Wonderland", author: "Lewis Carroll" },
  { id: 708, title: "The Princess and the Goblin", author: "George MacDonald" },
];

type SrdItem = { index?: string; name?: string; desc?: string | string[] };
type RpgEntryInsert = {
  source_type: "srd" | "gutenberg";
  source_title: string;
  source_author: string | null;
  source_url: string;
  content: string;
  sentence: string;
};
type IngestionDatabase = {
  public: {
    Tables: {
      rpg_entries: {
        Row: RpgEntryInsert & { id: string; content_tsv: string; created_at: string };
        Insert: RpgEntryInsert;
        Update: Partial<RpgEntryInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function fetchResponse(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      console.error(`Fetch failed for ${url}; cause: ${(lastError as Error).cause ?? "none"}`);
    } catch (error) {
      lastError = error;
      console.error(`Fetch failed for ${url}; cause: ${error instanceof Error ? error.cause ?? error.message : error}`);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw new Error(`Request failed after 3 attempts: ${url}`, { cause: lastError });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchResponse(url);
  try {
    return await response.json() as T;
  } catch (error) {
    console.error(`Fetch failed for ${url}; cause: ${error instanceof Error ? error.cause ?? error.message : error}`);
    throw error;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchResponse(url);
  try {
    return await response.text();
  } catch (error) {
    console.error(`Fetch failed for ${url}; cause: ${error instanceof Error ? error.cause ?? error.message : error}`);
    throw error;
  }
}

function extractText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(" ") : value ?? "";
}

function splitSentences(rawText: string): string[] {
  const cleaned = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\*{3} START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}/gi, "")
    .replace(/\*{3} END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}/gi, "")
    .replace(/START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*/gi, "")
    .replace(/END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*/gi, "")
    .replace(/\n\n+/g, " <paragraph-boundary> ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const protectedText = cleaned.replace(
    /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|e\.g|i\.e)\./gi,
    (match) => match.replace(".", "<prd>"),
  );

  const sentences: string[] = [];
  const sentenceBoundary = /[.!?](?:["'”’])?(?=\s+[A-Z"“'”’])/g;

  for (const paragraph of protectedText.split("<paragraph-boundary>")) {
    let start = 0;
    for (const match of paragraph.matchAll(sentenceBoundary)) {
      const end = (match.index ?? 0) + match[0].length;
      sentences.push(paragraph.slice(start, end));
      start = end;
    }
    sentences.push(paragraph.slice(start));
  }

  return sentences
    .map((sentence) => sentence.replace(/<prd>/g, ".").trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_LENGTH && sentence.length <= MAX_SENTENCE_LENGTH);
}

async function collectSrdEntries(): Promise<RpgEntryInsert[]> {
  const resources = [
    { endpoint: "spells", title: "Spells", file: "5e-SRD-Spells.json" },
    { endpoint: "monsters", title: "Monsters", file: "5e-SRD-Monsters.json" },
    { endpoint: "equipment", title: "Equipment", file: "5e-SRD-Equipment.json" },
  ];
  const entries: RpgEntryInsert[] = [];

  for (const resource of resources) {
    const filePath = join(process.cwd(), "data", resource.file);
    const raw = await readFile(filePath, "utf8");
    const items = JSON.parse(raw) as SrdItem[];
    for (const item of items) {
      if (!item.index) {
        console.warn(`Skipping SRD ${resource.title} item without index: ${item.name ?? "unknown"}`);
        continue;
      }
      const itemUrl = `https://www.dnd5eapi.co/api/2014/${resource.endpoint}/${item.index}`;
      for (const sentence of splitSentences(extractText(item.desc))) {
        entries.push({
          source_type: "srd",
          source_title: resource.title,
          source_author: null,
          source_url: itemUrl,
          content: sentence,
          sentence,
        });
      }
    }
    console.log(`Collected SRD ${resource.title}: ${entries.length} cumulative entries.`);
  }

  return entries;
}

async function collectGutenbergEntries(): Promise<RpgEntryInsert[]> {
  const entries: RpgEntryInsert[] = [];

  for (const book of GUTENBERG_BOOKS) {
    const textUrl = `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`;
    const text = await fetchText(textUrl);
    const sourceUrl = `https://www.gutenberg.org/ebooks/${book.id}`;
    for (const sentence of splitSentences(text)) {
      entries.push({
        source_type: "gutenberg",
        source_title: book.title,
        source_author: book.author,
        source_url: sourceUrl,
        content: sentence,
        sentence,
      });
    }
    console.log(`Collected Gutenberg ${book.id}: ${entries.length} cumulative entries.`);
  }

  return entries;
}

async function insertEntries(
  supabase: SupabaseClient<IngestionDatabase>,
  entries: RpgEntryInsert[],
): Promise<void> {
  for (let start = 0; start < entries.length; start += INSERT_BATCH_SIZE) {
    const batch = entries.slice(start, start + INSERT_BATCH_SIZE);
    const { error } = await supabase.from("rpg_entries").insert(batch);
    if (error) throw new Error(`Insert failed at row ${start}: ${error.message}`);
    console.log(`Inserted ${Math.min(start + batch.length, entries.length)}/${entries.length}.`);
  }
}

async function verifySearch(supabase: SupabaseClient<IngestionDatabase>): Promise<void> {
  for (const word of ["dragon", "spell", "forest", "king"]) {
    const { data, error } = await supabase
      .from("rpg_entries")
      .select("sentence")
      .textSearch("content_tsv", word, { type: "websearch", config: "english" })
      .limit(5);
    if (error) throw new Error(`Search check failed for ${word}: ${error.message}`);
    console.log(`Search ${word}:`, data?.map((row) => row.sentence) ?? []);
  }
}

async function main(): Promise<void> {
  const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
  const only = onlyArgument?.split("=", 2)[1];
  if (only && only !== "srd" && only !== "gutenberg") {
    throw new Error(`Unsupported --only value: ${only}. Use srd or gutenberg.`);
  }
  const supabase = createClient<IngestionDatabase>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_KEY ??
      requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
  const gutenbergEntries = only === "srd" ? [] : await collectGutenbergEntries();
  if (gutenbergEntries.length > 0) await insertEntries(supabase, gutenbergEntries);

  let srdEntries: RpgEntryInsert[] = [];
  if (only !== "gutenberg") {
    try {
      srdEntries = await collectSrdEntries();
      if (srdEntries.length > 0) await insertEntries(supabase, srdEntries);
    } catch (error) {
      console.error("SRD ingestion failed; Gutenberg entries were already inserted.", error);
    }
  }

  const entries = [...gutenbergEntries, ...srdEntries];
  await verifySearch(supabase);

  const counts = entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.source_type] = (result[entry.source_type] ?? 0) + 1;
    return result;
  }, {});
  console.log(`Ingestion complete: ${entries.length} entries inserted.`, counts);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});