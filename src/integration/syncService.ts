/**
 * Pull/sync service – Issue #12
 *
 * Fetches campaign entities from the external builder, caches them with
 * freshness metadata, and retries on transient failures.  Local DM overrides
 * always take precedence over synced data.
 *
 * Observability metrics (Issue #14) are tracked internally and exposed via
 * getHealth().
 */

import { EntityType, SchemaValidationError } from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A cached entry with the raw entity data and provenance metadata. */
export interface CacheEntry<T = unknown> {
  data: T;
  /** Unix timestamp (ms) when the entry was last fetched from the builder. */
  fetchedAt: number;
  /** The original builder entity identifier. */
  sourceId: string;
}

/** Summary result returned by a single sync operation. */
export interface SyncResult {
  success: boolean;
  entityType: EntityType;
  entityId: string;
  /** Wall-clock duration of the sync attempt in milliseconds. */
  durationMs: number;
  /** Present when success is false. */
  error?: string;
  /** Present when the builder payload failed schema validation. */
  schemaError?: SchemaValidationError;
}

/** Health snapshot for the entire sync service. */
export interface SyncHealth {
  totalSyncs: number;
  successCount: number;
  failureCount: number;
  schemaMismatchCount: number;
  /** Unix timestamp (ms) of the most recent sync attempt. */
  lastSyncAt?: number;
  /** Rolling average latency in ms across all sync attempts. */
  averageLatencyMs: number;
}

// ---------------------------------------------------------------------------
// SyncService
// ---------------------------------------------------------------------------

export interface SyncServiceOptions {
  /**
   * Age threshold in milliseconds after which a cached entry is considered
   * stale and should be re-fetched.  Defaults to 5 minutes.
   */
  stalenessMs?: number;
  /**
   * Maximum number of fetch attempts before a sync is marked as failed.
   * Defaults to 3.
   */
  maxRetries?: number;
  /**
   * Base delay in milliseconds between retry attempts (doubles on each retry).
   * Defaults to 0 in production (tests override to avoid slow-downs).
   */
  retryDelayMs?: number;
}

export class SyncService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly overrides = new Map<string, unknown>();
  private readonly stalenessMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  // Health counters
  private totalSyncs = 0;
  private successCount = 0;
  private failureCount = 0;
  private schemaMismatchCount = 0;
  private lastSyncAt?: number;
  private totalLatencyMs = 0;

  constructor(options: SyncServiceOptions = {}) {
    this.stalenessMs = options.stalenessMs ?? 5 * 60 * 1000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 0;
  }

  // -------------------------------------------------------------------------
  // Cache key helpers
  // -------------------------------------------------------------------------

  private cacheKey(entityType: EntityType, entityId: string): string {
    return `${entityType}:${entityId}`;
  }

  // -------------------------------------------------------------------------
  // Sync / fetch
  // -------------------------------------------------------------------------

  /**
   * Fetch a builder entity and store it in the cache.  The supplied `fetchFn`
   * is expected to return the raw entity payload (or throw on failure).
   *
   * Retries up to `maxRetries` times with exponential back-off before
   * giving up and recording a failure metric.
   */
  async sync(
    entityType: EntityType,
    entityId: string,
    fetchFn: () => Promise<unknown>,
    schemaValidateFn?: (raw: unknown) => SchemaValidationError | null,
  ): Promise<SyncResult> {
    this.totalSyncs++;
    const startMs = Date.now();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      if (attempt > 0 && this.retryDelayMs > 0) {
        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }

      try {
        const raw = await fetchFn();

        // Schema validation (Issue #14)
        if (schemaValidateFn) {
          const schemaError = schemaValidateFn(raw);
          if (schemaError) {
            this.schemaMismatchCount++;
            const durationMs = Date.now() - startMs;
            this.failureCount++;
            this.totalLatencyMs += durationMs;
            this.lastSyncAt = Date.now();
            return { success: false, entityType, entityId, durationMs, schemaError, error: schemaError.message };
          }
        }

        const key = this.cacheKey(entityType, entityId);
        this.cache.set(key, { data: raw, fetchedAt: Date.now(), sourceId: entityId });

        const durationMs = Date.now() - startMs;
        this.successCount++;
        this.totalLatencyMs += durationMs;
        this.lastSyncAt = Date.now();
        return { success: true, entityType, entityId, durationMs };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // All attempts exhausted
    const durationMs = Date.now() - startMs;
    this.failureCount++;
    this.totalLatencyMs += durationMs;
    this.lastSyncAt = Date.now();
    return {
      success: false,
      entityType,
      entityId,
      durationMs,
      error: lastError?.message ?? 'Unknown fetch error',
    };
  }

  // -------------------------------------------------------------------------
  // Entity retrieval
  // -------------------------------------------------------------------------

  /**
   * Retrieve the effective value for an entity.
   *
   * Resolution order:
   *   1. Local DM override (if any)
   *   2. Cached builder data (if present and not stale)
   *   3. undefined
   */
  get<T = unknown>(entityType: EntityType, entityId: string): T | undefined {
    const key = this.cacheKey(entityType, entityId);

    // Override always wins
    if (this.overrides.has(key)) {
      return this.overrides.get(key) as T;
    }

    const entry = this.cache.get(key);
    if (!entry) return undefined;
    return entry.data as T;
  }

  /**
   * Returns true when the cached entry for the entity is older than
   * `stalenessMs`, or when no cached entry exists.
   */
  isStale(entityType: EntityType, entityId: string): boolean {
    const key = this.cacheKey(entityType, entityId);
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() - entry.fetchedAt > this.stalenessMs;
  }

  // -------------------------------------------------------------------------
  // DM overrides (Issue #13)
  // -------------------------------------------------------------------------

  /**
   * Store a local DM override for the given entity.  The override takes
   * precedence over any cached builder data on subsequent get() calls.
   */
  setOverride<T = unknown>(entityType: EntityType, entityId: string, data: T): void {
    const key = this.cacheKey(entityType, entityId);
    this.overrides.set(key, data);
  }

  /**
   * Remove a local DM override.
   *
   * @returns true when an override was present and removed; false otherwise.
   */
  clearOverride(entityType: EntityType, entityId: string): boolean {
    const key = this.cacheKey(entityType, entityId);
    return this.overrides.delete(key);
  }

  /**
   * Return descriptors for all current DM overrides.
   * Keys that cannot be decomposed into a known EntityType are silently skipped.
   */
  listOverrides(): Array<{ entityType: EntityType; entityId: string }> {
    const validTypes: ReadonlySet<string> = new Set<EntityType>([
      'character',
      'npc',
      'mob',
      'location',
      'world',
    ]);
    const results: Array<{ entityType: EntityType; entityId: string }> = [];
    for (const key of this.overrides.keys()) {
      const colonIndex = key.indexOf(':');
      if (colonIndex === -1) continue;
      const entityType = key.slice(0, colonIndex);
      const entityId = key.slice(colonIndex + 1);
      if (!validTypes.has(entityType)) continue;
      results.push({ entityType: entityType as EntityType, entityId });
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Health / observability (Issue #14)
  // -------------------------------------------------------------------------

  /** Return a health snapshot for observability. */
  getHealth(): SyncHealth {
    const attempted = this.successCount + this.failureCount;
    return {
      totalSyncs: this.totalSyncs,
      successCount: this.successCount,
      failureCount: this.failureCount,
      schemaMismatchCount: this.schemaMismatchCount,
      ...(this.lastSyncAt !== undefined && { lastSyncAt: this.lastSyncAt }),
      averageLatencyMs: attempted > 0 ? Math.round(this.totalLatencyMs / attempted) : 0,
    };
  }

  /** Reset all counters and caches (used in tests). */
  reset(): void {
    this.cache.clear();
    this.overrides.clear();
    this.totalSyncs = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.schemaMismatchCount = 0;
    this.lastSyncAt = undefined;
    this.totalLatencyMs = 0;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Singleton sync service instance used across the application. */
export const syncService = new SyncService();
