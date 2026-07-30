import fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseMatchFromPages } from "./parser";
import { textItemsToLines } from "./pdf";

describe("real PDF import", () => {
  it("extracts and parses the sample scorecard PDF", async () => {
    const data = new Uint8Array(fs.readFileSync("samplepdf/Summary Scorecard 26291013.pdf"));
    const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(textItemsToLines(content.items).join("\n"));
    }

    const match = parseMatchFromPages(pages, "Summary Scorecard 26291013.pdf");

    expect(match.teamA).toBe("HURRICANES");
    expect(match.teamB).toBe("DOMINATORS");
    expect(match.resultText).toBe("HURRICANES won by 32 runs");
    expect(match.ground).toContain("Spectra Sports Arena");
    expect(match.squads).toHaveLength(12);
    expect(match.innings[0].totalRuns).toBe(97);
    expect(match.innings[1].totalRuns).toBe(65);
  });
});
