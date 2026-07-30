import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfPages(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(textItemsToLines(content.items).join("\n").trim());
  }

  if (pages.every((page) => page.length === 0)) {
    throw new Error("This PDF does not contain extractable text. The CricHeroes export format may have changed.");
  }

  return pages;
}

export function textItemsToLines(items: unknown[]): string[] {
  const rows = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) continue;
    const text = String((item as { str: string }).str).trim();
    const transform = (item as { transform: number[] }).transform;
    if (!text || !Array.isArray(transform)) continue;

    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const lineKey = Math.round(y * 2) / 2;
    rows.set(lineKey, [...(rows.get(lineKey) ?? []), { x, text }]);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
