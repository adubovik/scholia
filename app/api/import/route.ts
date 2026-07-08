import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { htmlToParagraphs } from "@/lib/import/html";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(url, { headers: { "user-agent": "ScholiaBot/1.0" } });
    if (!res.ok) return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });
    html = await res.text();
  } catch {
    return NextResponse.json({ error: "Fetch error" }, { status: 502 });
  }

  return NextResponse.json(htmlToParagraphs(html));
}
