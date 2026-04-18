import { UploadForm } from "@/components/upload-form";

const features = [
  "Preserves DOCX layout by editing only Word text nodes",
  "Uses OpenAI with a CV-specific glossary and formatting rules",
  "Protects emails, phones, dates, URLs, and common codes from translation",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DOCX to DOCX translation</p>
          <h1>Translate CVs into English without rebuilding the document.</h1>
          <p className="lede">
            Upload one `.docx`, translate it with OpenAI, and download a new
            Word file that keeps the original structure, styles, headers,
            footers, tables, and images.
          </p>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
        <UploadForm />
      </section>
    </main>
  );
}

