import JSZip from "jszip";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { extractParagraphSegments, replaceParagraphText, validateXml } from "@/lib/docx/xml";
import { getEnv } from "@/lib/env";
import { formatGlossaryForPrompt, PROTECTED_TERMS } from "@/lib/glossary";
import { getOpenAIClient } from "@/lib/openai";
import type { ParagraphSegment, TranslationMetrics } from "@/lib/docx/types";

const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024;
const BATCH_SIZE = 18;
const NON_TRANSLATABLE_PATHS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/styles.xml",
  "word/fontTable.xml",
  "word/settings.xml",
  "word/webSettings.xml",
  "word/numbering.xml",
];

const PROTECTED_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^\s<>"']+\b/gi,
  /\b(?:\+?\d[\d ()/-]{6,}\d)\b/g,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b\d{4,}(?:-\d+)+\b/g,
];

const translationSchema = z.object({
  translations: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
});

interface TranslationPayload {
  buffer: Buffer;
  outputFileName: string;
  metrics: TranslationMetrics;
}

type TranslateSegments = (
  segments: ParagraphSegment[],
) => Promise<Array<{ id: string; text: string }>>;

interface TranslateDocxOptions {
  translateSegments?: TranslateSegments;
}

function getRequiredDocxEntries(zip: JSZip) {
  return Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);
}

async function validateGeneratedDocxPackage(
  sourceEntries: string[],
  outputBuffer: Buffer,
) {
  const generatedZip = await JSZip.loadAsync(outputBuffer);
  const generatedEntries = getRequiredDocxEntries(generatedZip);
  const generatedEntrySet = new Set(generatedEntries);
  const missingEntries = sourceEntries.filter((entry) => !generatedEntrySet.has(entry));

  if (missingEntries.length > 0) {
    throw new Error(
      `Generated DOCX is missing required package entries: ${missingEntries.slice(0, 5).join(", ")}`,
    );
  }

  if (!generatedZip.file("word/document.xml")) {
    throw new Error("Generated DOCX is missing word/document.xml.");
  }
}

function isDocxFile(filename: string) {
  return filename.toLowerCase().endsWith(".docx");
}

function shouldProcessWordPart(path: string) {
  if (!path.startsWith("word/")) {
    return false;
  }

  if (!path.endsWith(".xml")) {
    return false;
  }

  if (NON_TRANSLATABLE_PATHS.includes(path)) {
    return false;
  }

  return true;
}

function looksTranslatable(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();

  if (trimmed.length < 2) {
    return false;
  }

  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(trimmed)) {
    return false;
  }

  return true;
}

function chunkSegments<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function protectText(text: string) {
  let nextText = text;
  const replacements = new Map<string, string>();
  let counter = 0;

  for (const term of PROTECTED_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    nextText = nextText.replace(pattern, (match) => {
      const token = `[[KEEP_${counter}]]`;
      replacements.set(token, match);
      counter += 1;
      return token;
    });
  }

  for (const pattern of PROTECTED_PATTERNS) {
    nextText = nextText.replace(pattern, (match) => {
      const token = `[[KEEP_${counter}]]`;
      replacements.set(token, match);
      counter += 1;
      return token;
    });
  }

  return { protectedText: nextText, replacements };
}

function restoreProtectedText(text: string, replacements: Map<string, string>) {
  let restored = text;

  for (const [token, value] of replacements.entries()) {
    restored = restored.replaceAll(token, value);
  }

  return restored;
}

function normalizeTranslatedText(text: string) {
  return text.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

async function translateBatch(segments: ParagraphSegment[]) {
  const env = getEnv();
  const client = getOpenAIClient();
  const preparedSegments = segments.map((segment) => {
    const { protectedText, replacements } = protectText(segment.text);

    return {
      id: segment.id,
      protectedText,
      replacements,
    };
  });

  const response = await client.responses.parse({
    model: env.OPENAI_MODEL,
    reasoning: {
      effort: "low",
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You translate Spanish resumes into natural professional English. " +
              "Return valid structured JSON only. Keep every placeholder token like [[KEEP_0]] unchanged. " +
              "Do not invent facts. Preserve concise resume tone. Use the glossary when a source phrase appears.\n\n" +
              `Glossary:\n${formatGlossaryForPrompt()}`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              sourceLanguage: "es",
              targetLanguage: "en",
              segments: preparedSegments.map((segment) => ({
                id: segment.id,
                text: segment.protectedText,
              })),
            }),
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(translationSchema, "cv_translation_batch"),
    },
  });

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error("OpenAI did not return structured translations.");
  }

  const byId = new Map(parsed.translations.map((item) => [item.id, item.text]));

  return preparedSegments.map((segment) => {
    const translated = byId.get(segment.id);

    if (!translated) {
      throw new Error(`Missing translation for segment ${segment.id}.`);
    }

    return {
      id: segment.id,
      text: restoreProtectedText(normalizeTranslatedText(translated), segment.replacements),
    };
  });
}

function buildOutputFilename(filename: string) {
  return filename.replace(/\.docx$/i, "_en.docx");
}

export async function translateDocxFile(
  fileBuffer: Buffer,
  filename: string,
  options: TranslateDocxOptions = {},
): Promise<TranslationPayload> {
  if (!isDocxFile(filename)) {
    throw new Error("The uploaded file must be a .docx document.");
  }

  if (fileBuffer.byteLength === 0) {
    throw new Error("The uploaded file is empty.");
  }

  if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error("The uploaded file exceeds the 6 MB limit.");
  }

  const zip = await JSZip.loadAsync(fileBuffer);
  const sourceEntries = getRequiredDocxEntries(zip);
  const wordPartPaths = Object.keys(zip.files).filter(shouldProcessWordPart);

  if (!zip.file("word/document.xml")) {
    throw new Error("This DOCX file does not contain word/document.xml.");
  }

  const partXmlByPath = new Map<string, string>();
  const allSegments: ParagraphSegment[] = [];

  for (const path of wordPartPaths) {
    const xml = await zip.file(path)?.async("string");

    if (!xml) {
      continue;
    }

    partXmlByPath.set(path, xml);

    const partSegments = extractParagraphSegments(xml, path).filter((segment) =>
      looksTranslatable(segment.text),
    );

    allSegments.push(...partSegments);
  }

  if (allSegments.length === 0) {
    throw new Error("No translatable text segments were found in the DOCX file.");
  }

  const translatedMap = new Map<string, string>();
  const segmentBatches = chunkSegments(allSegments, BATCH_SIZE);
  const translateSegments = options.translateSegments ?? translateBatch;

  for (const batch of segmentBatches) {
    const translatedBatch = await translateSegments(batch);

    translatedBatch.forEach((item) => {
      translatedMap.set(item.id, item.text);
    });
  }

  const touchedParts = new Set<string>();

  for (const path of wordPartPaths) {
    const originalXml = partXmlByPath.get(path);

    if (!originalXml) {
      continue;
    }

    const segmentsForPart = allSegments.filter((segment) => segment.partPath === path);
    let nextXml = originalXml;

    for (const segment of segmentsForPart) {
      const translated = translatedMap.get(segment.id);

      if (!translated || translated === segment.text) {
        continue;
      }

      const updatedParagraph = replaceParagraphText(
        segment.paragraphXml,
        segment.textNodes,
        translated,
      );

      nextXml = nextXml.replace(segment.paragraphXml, updatedParagraph);
      touchedParts.add(path);
    }

    validateXml(nextXml, path);
    zip.file(path, nextXml);
  }

  const outputBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "DOS",
    streamFiles: false,
    compressionOptions: {
      level: 1,
    },
  });

  await validateGeneratedDocxPackage(sourceEntries, outputBuffer);

  return {
    buffer: outputBuffer,
    outputFileName: buildOutputFilename(filename),
    metrics: {
      translatedSegments: translatedMap.size,
      translatedParts: touchedParts.size,
    },
  };
}
