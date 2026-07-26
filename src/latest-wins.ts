/**
 * Serializes async work so only the latest scheduled request is allowed to
 * finish applying side effects. Older in-flight work may still run until its
 * next `isCurrent()` check, but superseded requests are skipped entirely once
 * the active task yields.
 */
export type LatestWinsTask = (isCurrent: () => boolean) => Promise<void>;

export class LatestWinsCoordinator {
  private latestId = 0;
  private chain: Promise<void> = Promise.resolve();

  /**
   * Schedule `task` after any previously scheduled work. Returns a promise that
   * settles when this request has either run to completion or been skipped
   * because a newer request superseded it.
   */
  schedule(task: LatestWinsTask): Promise<void> {
    const id = ++this.latestId;
    const isCurrent = () => id === this.latestId;
    const run = this.chain.then(async () => {
      if (!isCurrent()) return;
      await task(isCurrent);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
