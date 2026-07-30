import { describe, expect, it } from "vitest";
import { samplePages } from "../data/sampleText";
import { parseMatchFromPages } from "./parser";
import { appendMatch, findDuplicateMatch } from "./storage";

describe("match duplicate detection", () => {
  it("detects the same match by content fingerprint", () => {
    const match = parseMatchFromPages(samplePages, "first-name.pdf");
    const sameMatchDifferentFilename = parseMatchFromPages(samplePages, "second-name.pdf");
    const state = { matches: [match], players: [] };

    expect(findDuplicateMatch(state, sameMatchDifferentFilename)?.id).toBe(match.id);
    expect(() => appendMatch(state, sameMatchDifferentFilename)).toThrow("already exists");
  });

  it("detects duplicate filenames", () => {
    const match = parseMatchFromPages(samplePages, "same-file.pdf");
    const renamedContent = { ...match, id: "different-id", fingerprint: "different-fingerprint" };
    const state = { matches: [match], players: [] };

    expect(findDuplicateMatch(state, renamedContent)?.sourcePdfFilename).toBe("same-file.pdf");
  });
});
