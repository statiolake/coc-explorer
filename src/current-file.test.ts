import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateFromUri,
  isNormalFileCandidate,
  nextRememberedFile,
  resolveEditorFile,
  resolveFileAtExplorerFocus,
} from "./current-file";

const fileA = {
  buftype: "",
  scheme: "file",
  fsPath: "/proj/a.ts",
} as const;

const fileB = {
  buftype: "",
  scheme: "file",
  fsPath: "/proj/b.ts",
} as const;

const cocTree = {
  buftype: "nofile",
  scheme: "file",
  fsPath: "/tmp/CocTree0",
} as const;

const untitled = {
  buftype: "",
  scheme: "untitled",
  fsPath: "untitled:1",
} as const;

describe("current-file policy", () => {
  it("updates remembered path only for normal file buffers", () => {
    assert.equal(nextRememberedFile(undefined, fileA), "/proj/a.ts");
    assert.equal(nextRememberedFile("/proj/a.ts", fileB), "/proj/b.ts");
  });

  it("does not overwrite remembered path for CocTree / UI buffers", () => {
    assert.equal(nextRememberedFile("/proj/a.ts", cocTree), "/proj/a.ts");
  });

  it("does not clear remembered path for non-file schemes", () => {
    assert.equal(nextRememberedFile("/proj/a.ts", untitled), "/proj/a.ts");
  });

  it("keeps previous when the buffer candidate is missing", () => {
    assert.equal(nextRememberedFile("/proj/a.ts", undefined), "/proj/a.ts");
  });

  it("resolves the active file when focus is still on an editor buffer", () => {
    assert.equal(resolveEditorFile("/proj/old.ts", fileB, fileA), "/proj/b.ts");
  });

  it("prefers alternate window file over remembered when active is CocTree", () => {
    assert.equal(
      resolveEditorFile("/proj/stale.ts", cocTree, fileB),
      "/proj/b.ts",
    );
  });

  it("ignores UI / CocTree alternate and falls back to remembered", () => {
    assert.equal(
      resolveEditorFile("/proj/a.ts", cocTree, cocTree),
      "/proj/a.ts",
    );
    assert.equal(
      resolveEditorFile("/proj/a.ts", cocTree, untitled),
      "/proj/a.ts",
    );
  });

  it("falls back to remembered file when Explorer / UI has focus", () => {
    assert.equal(resolveEditorFile("/proj/a.ts", cocTree), "/proj/a.ts");
    assert.equal(resolveEditorFile("/proj/a.ts", undefined), "/proj/a.ts");
    assert.equal(
      resolveEditorFile("/proj/a.ts", cocTree, undefined),
      "/proj/a.ts",
    );
  });

  it("classifies normal file candidates", () => {
    assert.equal(isNormalFileCandidate(fileA), true);
    assert.equal(isNormalFileCandidate(cocTree), false);
    assert.equal(isNormalFileCandidate(untitled), false);
    assert.equal(isNormalFileCandidate(undefined), false);
  });

  it("builds candidates from uri-like values", () => {
    assert.deepEqual(
      candidateFromUri("", { scheme: "file", fsPath: "/proj/a.ts" }),
      { buftype: "", scheme: "file", fsPath: "/proj/a.ts" },
    );
  });
});

describe("resolveFileAtExplorerFocus", () => {
  it("does not use stale Coc active A; direct editor B wins", () => {
    // Explicit reveal would wrongly prefer stale Coc active A over editor B:
    assert.equal(resolveEditorFile("/proj/a.ts", fileA, fileB), "/proj/a.ts");
    // Focus policy never takes Coc active as input — only the direct editor:
    assert.equal(resolveFileAtExplorerFocus("/proj/a.ts", fileB), "/proj/b.ts");
  });

  it("falls back to remembered when the direct candidate is invalid or missing", () => {
    assert.equal(
      resolveFileAtExplorerFocus("/proj/a.ts", cocTree),
      "/proj/a.ts",
    );
    assert.equal(
      resolveFileAtExplorerFocus("/proj/a.ts", untitled),
      "/proj/a.ts",
    );
    assert.equal(
      resolveFileAtExplorerFocus("/proj/a.ts", undefined),
      "/proj/a.ts",
    );
  });
});
