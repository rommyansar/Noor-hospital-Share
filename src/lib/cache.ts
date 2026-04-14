const globalAny: any = global;

if (!globalAny.hospitalCache) {
  globalAny.hospitalCache = {
    reports: new Map<string, any>(),
    locks: new Set<string>(),
  };
}

const cache = globalAny.hospitalCache;

// 1. REPORT CACHING

export function getReportCache(departmentId: string, month: string) {
  const key = `${departmentId}_${month}`;
  return cache.reports.get(key) || null;
}

export function setReportCache(departmentId: string, month: string, data: any) {
  const key = `${departmentId}_${month}`;
  cache.reports.set(key, data);
}

// Clear the entire report cache to ensure data safety on any core modification
export function invalidateReportCache() {
  cache.reports.clear();
}

// 2. CALCULATION LOCKING

export function acquireCalculationLock(identifier: string): boolean {
  if (cache.locks.has(identifier)) return false;
  cache.locks.add(identifier);
  return true;
}

export function releaseCalculationLock(identifier: string): void {
  cache.locks.delete(identifier);
}
