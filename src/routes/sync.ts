/**
 * Sync management routes – Issues #13 and #14
 *
 * Provides DM tools for manual refresh and entity overrides (Issue #13) and
 * integration health-check / observability endpoints (Issue #14).
 *
 * All mutating operations require the DM role; health checks are accessible
 * to any authenticated role.
 *
 * Routes:
 *   GET    /campaign/sync/health                              – health snapshot
 *   POST   /campaign/sync/refresh/:entityType/:entityId       – manual re-sync
 *   GET    /campaign/sync/overrides                           – list overrides
 *   PUT    /campaign/sync/overrides/:entityType/:entityId     – set override
 *   DELETE /campaign/sync/overrides/:entityType/:entityId     – clear override
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import { AuthenticatedRequest } from '../types';
import { syncService } from '../integration/syncService';
import { EntityType, validateBuilderEntity } from '../integration/schema';

const router = Router();

/** Set of valid entity type strings for input validation. */
const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set<EntityType>([
  'character',
  'npc',
  'mob',
  'location',
  'world',
]);

/** Build a standardised 400 error message for an unrecognised entity type. */
function invalidEntityTypeError(entityType: string): string {
  return `Invalid entityType '${entityType}'. Must be one of: ${[...VALID_ENTITY_TYPES].join(', ')}`;
}

// ---------------------------------------------------------------------------
// Health check – Issue #14
// ---------------------------------------------------------------------------

/**
 * GET /campaign/sync/health
 *
 * Returns a health snapshot including sync success/failure counts, schema
 * mismatch count, last sync timestamp, and average latency.
 * Accessible to any authenticated role.
 */
router.get(
  '/health',
  authenticate,
  requirePermission('session:read'),
  (_req: Request, res: Response): void => {
    res.status(200).json(syncService.getHealth());
  },
);

// ---------------------------------------------------------------------------
// Manual refresh – Issue #13
// ---------------------------------------------------------------------------

/**
 * POST /campaign/sync/refresh/:entityType/:entityId
 *
 * Triggers a manual re-sync of the specified entity from the builder.
 * The DM can supply the latest builder payload in the request body as a
 * JSON object; if no body is provided the endpoint simulates a no-op fetch
 * (useful for testing connectivity without a real builder backend).
 *
 * DM only.
 */
router.post(
  '/refresh/:entityType/:entityId',
  authenticate,
  requirePermission('encounter:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };

    if (!VALID_ENTITY_TYPES.has(entityType)) {
      res.status(400).json({ error: invalidEntityTypeError(entityType) });
      return;
    }

    const payload = req.body ?? {};

    const result = await syncService.sync(
      entityType as EntityType,
      entityId,
      async () => (Object.keys(payload).length > 0 ? payload : { builderId: entityId, _simulated: true }),
      (raw) =>
        validateBuilderEntity(entityType as EntityType, entityId, raw as Record<string, unknown>),
    );

    if (!result.success) {
      res.status(422).json({ error: result.error, schemaError: result.schemaError ?? undefined });
      return;
    }

    res.status(200).json({
      message: `Entity '${entityId}' (${entityType}) synced successfully`,
      durationMs: result.durationMs,
      isStale: syncService.isStale(entityType as EntityType, entityId),
    });
  },
);

// ---------------------------------------------------------------------------
// Override management – Issue #13
// ---------------------------------------------------------------------------

/**
 * GET /campaign/sync/overrides
 *
 * Returns the list of all active DM overrides.
 * DM only.
 */
router.get(
  '/overrides',
  authenticate,
  requirePermission('encounter:manage'),
  (_req: Request, res: Response): void => {
    res.status(200).json({ overrides: syncService.listOverrides() });
  },
);

/**
 * PUT /campaign/sync/overrides/:entityType/:entityId
 *
 * Store a local DM override for the specified entity.  The request body
 * must be a JSON object representing the overridden entity data.
 *
 * After this call, get() for the entity returns the override instead of
 * any cached builder data, giving the DM live control during a session.
 * DM only.
 */
router.put(
  '/overrides/:entityType/:entityId',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    const session = (req as AuthenticatedRequest).session;

    if (!VALID_ENTITY_TYPES.has(entityType)) {
      res.status(400).json({ error: invalidEntityTypeError(entityType) });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Request body must be a JSON object representing the override data' });
      return;
    }

    syncService.setOverride(entityType as EntityType, entityId, body);
    res.status(200).json({
      message: `Override set for '${entityId}' (${entityType})`,
      entityType,
      entityId,
      setBy: session.sub,
    });
  },
);

/**
 * DELETE /campaign/sync/overrides/:entityType/:entityId
 *
 * Remove a local DM override for the specified entity.  Subsequent get()
 * calls will fall back to cached builder data.
 * DM only.
 */
router.delete(
  '/overrides/:entityType/:entityId',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };

    if (!VALID_ENTITY_TYPES.has(entityType)) {
      res.status(400).json({ error: invalidEntityTypeError(entityType) });
      return;
    }

    const removed = syncService.clearOverride(entityType as EntityType, entityId);
    if (!removed) {
      res.status(404).json({ error: `No override found for '${entityId}' (${entityType})` });
      return;
    }

    res.status(200).json({ message: `Override cleared for '${entityId}' (${entityType})` });
  },
);

export default router;
