export type RateLimits = { perVisitor: number; overall: number; windowMs: number };

// Counts calls in fixed windows and answers whether one more is allowed. The counts live in this process's memory, so
// each running copy of the server keeps its own: this slows a heavy user, it is not a hard ceiling on spending.
export const createRateLimit = (limits: RateLimits, now: () => number = Date.now): ((visitor: string) => boolean) => {
  let windowStart = now();
  let overall = 0;
  const visitors = new Map<string, number>();
  return (visitor) => {
    if (now() - windowStart >= limits.windowMs) {
      windowStart = now();
      overall = 0;
      visitors.clear();
    }
    const used = visitors.get(visitor) ?? 0;
    if (used >= limits.perVisitor || overall >= limits.overall) return false;
    visitors.set(visitor, used + 1);
    overall += 1;
    return true;
  };
};
