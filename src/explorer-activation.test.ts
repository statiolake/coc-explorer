import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ActivationCoalescer,
  decideExplorerActivation,
} from "./explorer-activation";

describe("decideExplorerActivation", () => {
  it("retries while TreeView.windowId is still unset", () => {
    assert.equal(
      decideExplorerActivation({
        treeWindowId: undefined,
        currentWindowId: 1001,
        superseded: false,
      }),
      "retry",
    );
  });

  it("retries while the current window id is unknown", () => {
    assert.equal(
      decideExplorerActivation({
        treeWindowId: 1001,
        currentWindowId: undefined,
        superseded: false,
      }),
      "retry",
    );
  });

  it("reveals only when the current window is the TreeView window", () => {
    assert.equal(
      decideExplorerActivation({
        treeWindowId: 1001,
        currentWindowId: 1001,
        superseded: false,
      }),
      "reveal",
    );
  });

  it("aborts when the tree is visible but not focused", () => {
    assert.equal(
      decideExplorerActivation({
        treeWindowId: 1001,
        currentWindowId: 2002,
        superseded: false,
      }),
      "abort",
    );
  });

  it("aborts when a newer activation superseded this attempt", () => {
    assert.equal(
      decideExplorerActivation({
        treeWindowId: 1001,
        currentWindowId: 1001,
        superseded: true,
      }),
      "abort",
    );
  });
});

describe("ActivationCoalescer", () => {
  it("keeps only the latest generation current", () => {
    const coalescer = new ActivationCoalescer();
    const first = coalescer.next();
    assert.equal(coalescer.isCurrent(first), true);

    const second = coalescer.next();
    assert.equal(coalescer.isCurrent(first), false);
    assert.equal(coalescer.isCurrent(second), true);

    const third = coalescer.next();
    assert.equal(coalescer.isCurrent(second), false);
    assert.equal(coalescer.isCurrent(third), true);
  });
});
