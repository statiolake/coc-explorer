import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LatestWinsCoordinator } from "./latest-wins";

function defer(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("LatestWinsCoordinator", () => {
  it("runs a single task to completion", async () => {
    const coordinator = new LatestWinsCoordinator();
    const seen: string[] = [];
    await coordinator.schedule(async (isCurrent) => {
      assert.equal(isCurrent(), true);
      seen.push("a");
    });
    assert.deepEqual(seen, ["a"]);
  });

  it("skips superseded work scheduled while a slower task is running", async () => {
    const coordinator = new LatestWinsCoordinator();
    const started = defer();
    const gate = defer();
    const seen: string[] = [];

    const first = coordinator.schedule(async (isCurrent) => {
      seen.push("start-1");
      started.resolve();
      await gate.promise;
      if (!isCurrent()) {
        seen.push("abort-1");
        return;
      }
      seen.push("apply-1");
    });

    await started.promise;

    const second = coordinator.schedule(async (isCurrent) => {
      if (!isCurrent()) {
        seen.push("skip-2");
        return;
      }
      seen.push("apply-2");
    });

    const third = coordinator.schedule(async (isCurrent) => {
      if (!isCurrent()) {
        seen.push("skip-3");
        return;
      }
      seen.push("apply-3");
    });

    gate.resolve();
    await Promise.all([first, second, third]);

    assert.deepEqual(seen, ["start-1", "abort-1", "apply-3"]);
  });

  it("keeps only the latest request when several are queued before any run", async () => {
    const coordinator = new LatestWinsCoordinator();
    const seen: string[] = [];

    const first = coordinator.schedule(async () => {
      seen.push("1");
    });
    const second = coordinator.schedule(async () => {
      seen.push("2");
    });
    const third = coordinator.schedule(async () => {
      seen.push("3");
    });

    await Promise.all([first, second, third]);
    assert.deepEqual(seen, ["3"]);
  });

  it("never lets an older task become the final applied result", async () => {
    const coordinator = new LatestWinsCoordinator();
    const slow = defer();
    const fast = defer();
    let visible: string | undefined;

    const older = coordinator.schedule(async (isCurrent) => {
      await slow.promise;
      if (!isCurrent()) return;
      visible = "old";
    });

    const newer = coordinator.schedule(async (isCurrent) => {
      await fast.promise;
      if (!isCurrent()) return;
      visible = "new";
    });

    // Older request finishes its await first, but a newer request already exists.
    slow.resolve();
    await older;
    assert.equal(visible, undefined);

    fast.resolve();
    await newer;
    assert.equal(visible, "new");
  });

  it("propagates task errors without breaking later requests", async () => {
    const coordinator = new LatestWinsCoordinator();
    const failed = coordinator.schedule(async () => {
      throw new Error("boom");
    });
    await assert.rejects(failed, /boom/);

    let ran = false;
    await coordinator.schedule(async () => {
      ran = true;
    });
    assert.equal(ran, true);
  });
});
