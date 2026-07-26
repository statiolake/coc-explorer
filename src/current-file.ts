/**
 * Snapshot of a buffer/document used to decide whether it should become the
 * remembered editor file. Kept free of coc.nvim types so policy is unit-testable.
 */
export type BufferFileCandidate = {
  buftype: string;
  scheme: string;
  fsPath: string;
};

/** True for a normal `file://` buffer (not CocTree / UI / special). */
export function isNormalFileCandidate(
  candidate: BufferFileCandidate | undefined,
): candidate is BufferFileCandidate {
  return Boolean(
    candidate && !candidate.buftype && candidate.scheme === "file",
  );
}

/**
 * Only normal `file://` buffers update the remembered path. CocTree / UI /
 * special buffers (`buftype` set) and non-file schemes never overwrite it.
 */
export function nextRememberedFile(
  previous: string | undefined,
  candidate: BufferFileCandidate | undefined,
): string | undefined {
  if (!isNormalFileCandidate(candidate)) return previous;
  return candidate.fsPath;
}

/**
 * Prefer a normal file buffer when one is focused; otherwise the alternate
 * (previous) window's normal file if present; otherwise the last remembered
 * editor file. CocTree / UI candidates never win.
 */
export function resolveEditorFile(
  remembered: string | undefined,
  active: BufferFileCandidate | undefined,
  alternate?: BufferFileCandidate | undefined,
): string | undefined {
  if (isNormalFileCandidate(active)) return active.fsPath;
  if (isNormalFileCandidate(alternate)) return alternate.fsPath;
  return remembered;
}

export function candidateFromUri(
  buftype: string,
  uri: { scheme: string; fsPath: string },
): BufferFileCandidate {
  return {
    buftype,
    scheme: uri.scheme,
    fsPath: uri.fsPath,
  };
}
