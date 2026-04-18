import { XMLValidator } from "fast-xml-parser";

import type { ParagraphSegment, ParagraphTextNode } from "@/lib/docx/types";

const PARAGRAPH_REGEX = /<w:p\b[\s\S]*?<\/w:p>/g;
const TEXT_NODE_REGEX = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
const FULL_TEXT_NODE_REGEX = /^(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)$/;

const XML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&apos;": "'",
};

export function decodeXmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (entity) => XML_ENTITY_MAP[entity] ?? entity,
    );
}

export function escapeXmlText(value: string) {
  return sanitizeXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function sanitizeXmlText(value: string) {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);

      if (codePoint === undefined) {
        return false;
      }

      return (
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
}

export function extractParagraphSegments(
  xml: string,
  partPath: string,
): ParagraphSegment[] {
  const matches = xml.matchAll(PARAGRAPH_REGEX);
  const segments: ParagraphSegment[] = [];
  let index = 0;

  for (const match of matches) {
    const paragraphXml = match[0];
    const textNodes: ParagraphTextNode[] = [];

    for (const textMatch of paragraphXml.matchAll(TEXT_NODE_REGEX)) {
      const fullMatch = textMatch[0];
      const innerXml = textMatch[1] ?? "";

      textNodes.push({
        fullMatch,
        innerXml,
        decodedText: decodeXmlEntities(innerXml),
      });
    }

    if (textNodes.length === 0) {
      index += 1;
      continue;
    }

    const text = textNodes.map((node) => node.decodedText).join("");
    segments.push({
      id: `${partPath}::${index}`,
      partPath,
      paragraphXml,
      text,
      textNodes,
    });

    index += 1;
  }

  return segments;
}

function findWhitespaceBreakpoint(text: string, target: number) {
  const radius = 12;

  for (let offset = 0; offset <= radius; offset += 1) {
    const left = target - offset;
    if (left > 0 && /\s/.test(text[left])) {
      return left;
    }

    const right = target + offset;
    if (right < text.length && /\s/.test(text[right])) {
      return right;
    }
  }

  return target;
}

export function splitTextAcrossNodes(
  translatedText: string,
  originalNodes: ParagraphTextNode[],
) {
  if (originalNodes.length === 1) {
    return [translatedText];
  }

  const weights = originalNodes.map((node) =>
    Math.max(node.decodedText.length, node.decodedText.trim().length > 0 ? 1 : 0),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight === 0) {
    return originalNodes.map((_, index) => (index === 0 ? translatedText : ""));
  }

  const chunks: string[] = [];
  let cursor = 0;
  let consumedWeight = 0;

  originalNodes.forEach((node, index) => {
    consumedWeight += weights[index];

    if (index === originalNodes.length - 1) {
      chunks.push(translatedText.slice(cursor));
      return;
    }

    const projected = Math.round(
      (consumedWeight / totalWeight) * translatedText.length,
    );
    const breakpoint = findWhitespaceBreakpoint(translatedText, projected);
    const safeBreakpoint = Math.max(cursor, Math.min(breakpoint, translatedText.length));

    chunks.push(translatedText.slice(cursor, safeBreakpoint));
    cursor = safeBreakpoint;

    if (node.decodedText.endsWith(" ") && !chunks[index].endsWith(" ")) {
      chunks[index] += " ";
    }
  });

  return chunks;
}

export function replaceParagraphText(
  paragraphXml: string,
  textNodes: ParagraphTextNode[],
  translatedText: string,
) {
  const replacements = splitTextAcrossNodes(translatedText, textNodes);
  let replacementIndex = 0;

  return paragraphXml.replace(TEXT_NODE_REGEX, (fullMatch) => {
    const node = textNodes[replacementIndex];
    const nextText = replacements[replacementIndex] ?? node?.decodedText ?? "";
    replacementIndex += 1;

    const parts = fullMatch.match(FULL_TEXT_NODE_REGEX);

    if (!parts) {
      return fullMatch;
    }

    return `${parts[1]}${escapeXmlText(nextText)}${parts[3]}`;
  });
}

export function validateXml(xml: string, partPath: string) {
  const result = XMLValidator.validate(xml, {
    allowBooleanAttributes: true,
    unpairedTags: [],
  });

  if (result !== true) {
    throw new Error(`Updated XML is invalid for ${partPath}.`);
  }
}
