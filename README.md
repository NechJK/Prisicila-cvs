# CV Translator

Translate Spanish CVs in `.docx` format into professional English while preserving the original Word layout.

## Stack

- Next.js App Router
- Vercel-compatible route handlers
- OpenAI Responses API with structured output
- JSZip for in-memory DOCX package editing
- `fast-xml-parser` for XML validation

## How it works

1. The app accepts one `.docx` file.
2. It opens the DOCX as an OOXML zip package.
3. It extracts visible text from `word/*.xml` content parts such as the main body, headers, footers, footnotes, and endnotes.
4. It translates paragraph-sized segments with OpenAI using a CV-specific glossary.
5. It reinjects translated text into the original Word text nodes without rebuilding styles, media, numbering, or relationships.
6. It validates updated XML before returning a new `.docx`.

## Environment variables

Copy `.env.example` and provide:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import it into Vercel.
3. Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the Vercel project settings.
4. Deploy.

## Notes

- The current scope is Spanish to English.
- The app processes one CV at a time.
- Fidelity is maximized by preserving the OOXML structure, but long English text can still cause line wrapping differences in Word.
