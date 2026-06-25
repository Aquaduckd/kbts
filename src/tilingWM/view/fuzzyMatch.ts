export function damerauLevenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) {
    return m;
  }
  if (m === 0) {
    return n;
  }

  const da = new Map<string, number>();
  const max = n + m;
  const d: number[][] = Array.from({ length: n + 2 }, () =>
    new Array<number>(m + 2).fill(0),
  );

  d[0][0] = max;
  for (let i = 0; i <= n; i++) {
    d[i + 1][1] = i;
    d[i + 1][0] = max;
  }
  for (let j = 0; j <= m; j++) {
    d[1][j + 1] = j;
    d[0][j + 1] = max;
  }

  for (let i = 1; i <= n; i++) {
    let db = 0;
    for (let j = 1; j <= m; j++) {
      const i1 = da.get(b[j - 1]) ?? 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        db = j;
      }
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,
        d[i + 1][j] + 1,
        d[i][j + 1] + 1,
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1),
      );
    }
    da.set(a[i - 1], i);
  }

  return d[n + 1][m + 1];
}

export function fuzzyMatchScore(label: string, query: string): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedLabel = label.toLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let totalScore = 0;

  for (const token of tokens) {
    const tokenScore = bestTokenScore(normalizedLabel, token);
    if (tokenScore === null) {
      return null;
    }
    totalScore += tokenScore;
  }

  return totalScore;
}

export function fuzzyMatchesLabel(label: string, query: string): boolean {
  return fuzzyMatchScore(label, query) !== null;
}

function bestTokenScore(label: string, token: string): number | null {
  const maxDistance = allowedDistance(token.length);
  const words = label.split(/\s+/).filter(Boolean);
  const candidates = [...words, label.replace(/\s+/g, "")];

  let best: number | null = null;

  for (const candidate of candidates) {
    if (candidate.includes(token)) {
      return 0;
    }

    const score = closestDistanceWithin(token, candidate, maxDistance);
    if (score !== null && (best === null || score < best)) {
      best = score;
    }
  }

  return best;
}

function closestDistanceWithin(
  query: string,
  target: string,
  maxDistance: number,
): number | null {
  if (!target) {
    return null;
  }

  let best: number | null = null;

  const consider = (candidate: string, positionPenalty = 0): void => {
    if (!candidate) {
      return;
    }

    const distance = damerauLevenshtein(query, candidate);
    if (distance <= maxDistance) {
      const score = distance + positionPenalty;
      if (best === null || score < best) {
        best = score;
      }
    }
  };

  if (Math.abs(query.length - target.length) <= maxDistance) {
    consider(target);
  }

  const minLen = Math.max(1, query.length - maxDistance);
  const maxLen = Math.min(target.length, query.length + maxDistance);

  for (let start = 0; start < target.length; start++) {
    for (let len = minLen; len <= maxLen; len++) {
      if (start + len > target.length) {
        continue;
      }
      consider(target.slice(start, start + len), start * 0.001);
    }
  }

  return best;
}

function allowedDistance(length: number): number {
  if (length <= 1) {
    return 0;
  }
  if (length <= 4) {
    return 1;
  }
  if (length <= 8) {
    return 2;
  }
  return 3;
}
