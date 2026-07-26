/**
 * Outcome of one deferred Explorer activation check.
 *
 * - `reveal`: TreeView window id is known and matches the current window.
 * - `retry`: window id (or current window) is not stable yet — wait and recheck.
 * - `abort`: superseded, or the tree is visible without focus (`focus: false`).
 */
export type ExplorerActivationDecision = "reveal" | "retry" | "abort";

export type ExplorerActivationInput = {
  treeWindowId: number | undefined;
  currentWindowId: number | undefined;
  /** True when a newer activation attempt has superseded this one. */
  superseded: boolean;
};

/**
 * Decide whether a deferred Explorer activation should reveal, keep waiting, or
 * give up. Reveal only when the TreeView is actually focused — never merely
 * shown with `focus: false`.
 */
export function decideExplorerActivation(
  input: ExplorerActivationInput,
): ExplorerActivationDecision {
  if (input.superseded) return "abort";
  if (input.treeWindowId == null) return "retry";
  if (input.currentWindowId == null) return "retry";
  if (input.currentWindowId !== input.treeWindowId) return "abort";
  return "reveal";
}

/**
 * Coalesces concurrent activation attempts so only the latest deferred wait
 * continues. Older waits see `isCurrent() === false` and abort.
 */
export class ActivationCoalescer {
  private latest = 0;

  next(): number {
    return ++this.latest;
  }

  isCurrent(generation: number): boolean {
    return generation === this.latest;
  }
}
