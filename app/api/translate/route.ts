import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { translateDocxFile } from "@/lib/docx/translate-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a DOCX file in the 'file' field." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const translated = await translateDocxFile(bytes, file.name);

    return new NextResponse(new Uint8Array(translated.buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${translated.outputFileName}"`,
        "X-Translation-Segments": String(translated.metrics.translatedSegments),
        "X-Translation-Parts": String(translated.metrics.translatedParts),
      },
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? "Server configuration error: check OPENAI_API_KEY and OPENAI_MODEL in Vercel Environment Variables."
        : error instanceof Error
          ? error.message
          : "The DOCX file could not be translated.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
