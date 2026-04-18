export interface ParagraphTextNode {
  fullMatch: string;
  innerXml: string;
  decodedText: string;
}

export interface ParagraphSegment {
  id: string;
  partPath: string;
  paragraphXml: string;
  text: string;
  textNodes: ParagraphTextNode[];
}

export interface TranslationMetrics {
  translatedSegments: number;
  translatedParts: number;
}

