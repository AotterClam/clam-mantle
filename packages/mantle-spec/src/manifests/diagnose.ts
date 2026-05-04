// TEMP STUB — actual implementation lands via parallel agent's port.
export function manifestPath(
  kind: string,
  name: string,
  jsonPointer: string,
  filePaths?: ReadonlyMap<string, { file: string; docIndex: number }>,
): string {
  const fp = filePaths?.get(`${kind}/${name}`);
  if (fp) return `${fp.file}#/${fp.docIndex}${jsonPointer}`;
  return `manifest:${kind}/${name}#${jsonPointer}`;
}

export function bestMatch(target: string, candidates: ReadonlyArray<string>): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const c of candidates) {
    const d = editDistance(target, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}
