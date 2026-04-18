import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV Translator",
  description:
    "Translate Spanish CVs in DOCX format to professional English while preserving the original Word layout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

