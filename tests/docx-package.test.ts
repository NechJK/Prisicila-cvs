import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import JSZip from "jszip";

import { translateDocxFile } from "../lib/docx/translate-docx";

function createMinimalDocx() {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">Hola </w:t></w:r>
      <w:r><w:t>mundo</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`,
  );
  zip.file(
    "word/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"/>`,
  );
  zip.file("word/media/image1.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

function createHeadingDocx(text: string) {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
  );

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

test("translateDocxFile preserves package entries and updates document text", async () => {
  const input = await createMinimalDocx();

  const result = await translateDocxFile(input, "sample.docx", {
    translateSegments: async (segments) =>
      segments.map((segment) => ({
        id: segment.id,
        text: segment.text.replace("Hola mundo", "Hello world"),
      })),
  });

  const outputZip = await JSZip.loadAsync(result.buffer);
  const entryNames = Object.keys(outputZip.files).filter((name) => !outputZip.files[name]?.dir);

  assert.deepEqual(
    entryNames.sort(),
    [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/media/image1.png",
      "word/styles.xml",
      "word/theme/theme1.xml",
    ].sort(),
  );

  const documentXml = await outputZip.file("word/document.xml")?.async("string");

  assert.match(documentXml ?? "", /Hello/i);
  assert.match(documentXml ?? "", /World/i);
  assert.equal(result.metrics.translatedParts, 1);
  assert.equal(result.metrics.translatedSegments, 1);
});

test("translateDocxFile preserves all package entries for a real CV sample when available", async (t) => {
  const samplePath = "/Users/jinkunchen/Downloads/CV_Fac_EMP_AlemanVargasFrancisco.docx";

  try {
    await fs.access(samplePath);
  } catch {
    t.skip("Real CV sample is not available on this machine.");
    return;
  }

  const input = await fs.readFile(samplePath);
  const originalZip = await JSZip.loadAsync(input);
  const originalEntries = Object.keys(originalZip.files)
    .filter((name) => !originalZip.files[name]?.dir)
    .sort();

  const result = await translateDocxFile(input, "CV_Fac_EMP_AlemanVargasFrancisco.docx", {
    translateSegments: async (segments) =>
      segments.map((segment) => ({
        id: segment.id,
        text: `[EN] ${segment.text}`,
      })),
  });

  const outputZip = await JSZip.loadAsync(result.buffer);
  const outputEntries = Object.keys(outputZip.files)
    .filter((name) => !outputZip.files[name]?.dir)
    .sort();

  assert.deepEqual(outputEntries, originalEntries);
  assert.ok(result.metrics.translatedParts > 0);
  assert.ok(result.metrics.translatedSegments > 0);
});

test("translateDocxFile restores title casing for short headings and labels", async () => {
  const input = await createHeadingDocx("Datos personales");

  const result = await translateDocxFile(input, "heading.docx", {
    translateSegments: async (segments) =>
      segments.map((segment) => ({
        id: segment.id,
        text: "personal information",
      })),
  });

  const outputZip = await JSZip.loadAsync(result.buffer);
  const documentXml = await outputZip.file("word/document.xml")?.async("string");

  assert.ok(documentXml?.includes("Personal Information"));
});

test("translateDocxFile preserves uppercase style for uppercase headings", async () => {
  const input = await createHeadingDocx("EXPERIENCIA PROFESIONAL");

  const result = await translateDocxFile(input, "heading.docx", {
    translateSegments: async (segments) =>
      segments.map((segment) => ({
        id: segment.id,
        text: "professional experience",
      })),
  });

  const outputZip = await JSZip.loadAsync(result.buffer);
  const documentXml = await outputZip.file("word/document.xml")?.async("string");

  assert.ok(documentXml?.includes("PROFESSIONAL EXPERIENCE"));
});
