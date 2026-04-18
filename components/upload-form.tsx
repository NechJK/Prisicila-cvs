"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      message: string;
      segments: number;
      parts: number;
      filename: string;
    }
  | { kind: "error"; message: string };

function readMetricHeader(response: Response, key: string) {
  const value = response.headers.get(key);
  return value ? Number(value) : 0;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const buttonLabel = useMemo(() => {
    if (status.kind === "loading") {
      return "Translating…";
    }

    return "Translate CV";
  }, [status.kind]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);

    if (status.kind !== "idle") {
      setStatus({ kind: "idle" });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setStatus({ kind: "error", message: "Choose a DOCX file first." });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStatus({ kind: "loading" });

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Translation failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "translated_cv_en.docx";

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      setStatus({
        kind: "success",
        message: "The translated DOCX is ready and has been downloaded.",
        segments: readMetricHeader(response, "X-Translation-Segments"),
        parts: readMetricHeader(response, "X-Translation-Parts"),
        filename,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Translation failed.";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <section className="panel">
      <h2>Upload your CV</h2>
      <p>
        The app accepts one `.docx` file at a time and returns a translated
        `.docx` with the same Word package structure.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">Word document</span>
          <input
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="file-input"
            name="file"
            onChange={onChange}
            type="file"
          />
        </label>

        <button className="button" disabled={!file || status.kind === "loading"} type="submit">
          {buttonLabel}
        </button>

        <p className="note">
          Use `OPENAI_MODEL` if you want to override the default `gpt-5.4-mini`
          model on Vercel.
        </p>

        {status.kind === "error" ? (
          <div className="status-card error">
            <strong>Couldn&apos;t translate the file</strong>
            <p>{status.message}</p>
          </div>
        ) : null}

        {status.kind === "success" ? (
          <div className="status-card success">
            <strong>Translation complete</strong>
            <p>{status.message}</p>
            <div className="metrics">
              <div className="metric">
                <span>Output file</span>
                <strong>{status.filename}</strong>
              </div>
              <div className="metric">
                <span>Translated segments</span>
                <strong>{status.segments}</strong>
              </div>
              <div className="metric">
                <span>Word parts touched</span>
                <strong>{status.parts}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

