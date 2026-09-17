import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "Enter a word or short phrase." }, { status: 400 });
  }

  return NextResponse.json({
    query,
    science: {
      sentence: "The Second Law of Thermodynamics, which asserts that the entropy of an isolated system never decreases, is often taken to imply that the universe must have had a beginning and will have an end. However, if we consider a cyclic cosmology, where the remote future of one aeon is identified with the Big Bang of the next, then the entropy reset at the transition between aeons allows for an endless succession of cosmic cycles, each beginning with a Big Bang and ending in a distant future of maximal entropy.",
      source: 'From Roger Penrose, "Cycles of Time: An Extraordinary New View of the Universe" (2010)',
      sourceUrl: null,
    },
    fantasy: {
      sentence: "And the world was young, and the mountains green, and the Eldar made war upon the Dark Lord in his unassailable fortress, and the dark towers of Thangorodrim were thrown down, and the land was broken, and the seas roared in.",
      source: "J.R.R. Tolkien, The Silmarillion",
      sourceUrl: null,
      isFallback: false,
    },
    cached: false,
    demo: true,
  });
}
