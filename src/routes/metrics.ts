/**
 * Performance Metrics routes – Issue #18
 *
 * Clients (map display, table display, player browsers) report latency and FPS
 * measurements so the DM can identify bottlenecks before and during live sessions.
 *
 * Routes:
 *   POST /campaign/metrics           – report a client metric sample (any authenticated role)
 *   GET  /campaign/metrics           – retrieve performance summary (DM only)
 *   GET  /campaign/metrics/raw       – retrieve raw metric reports (DM only)
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import { addClientMetric, getAllMetrics, getPerformanceSummary } from '../store';
import { AuthenticatedRequest, ClientMetric, ClientType } from '../types';

const router = Router();

const VALID_CLIENT_TYPES: ReadonlySet<ClientType> = new Set<ClientType>(['map', 'table', 'player', 'dm']);

// ---------------------------------------------------------------------------
// POST /campaign/metrics – submit a performance report
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticate,
  requirePermission('session:read'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const { clientType, latencyMs, fps } = req.body ?? {};

    if (!VALID_CLIENT_TYPES.has(clientType as ClientType)) {
      res.status(400).json({
        error: `'clientType' must be one of: ${[...VALID_CLIENT_TYPES].join(', ')}`,
      });
      return;
    }
    if (latencyMs !== undefined && (typeof latencyMs !== 'number' || latencyMs < 0)) {
      res.status(400).json({ error: "'latencyMs' must be a non-negative number" });
      return;
    }
    if (fps !== undefined && (typeof fps !== 'number' || fps < 0)) {
      res.status(400).json({ error: "'fps' must be a non-negative number" });
      return;
    }
    if (latencyMs === undefined && fps === undefined) {
      res.status(400).json({ error: "At least one of 'latencyMs' or 'fps' must be provided" });
      return;
    }

    const metric: ClientMetric = {
      id: `metric-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clientType: clientType as ClientType,
      userId: session.sub,
      sessionId: session.sid,
      ...(latencyMs !== undefined && { latencyMs }),
      ...(fps !== undefined && { fps }),
      reportedAt: Date.now(),
    };

    const stored = addClientMetric(metric);
    res.status(201).json(stored);
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/metrics – performance summary (DM only)
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requirePermission('encounter:manage'),
  (_req: Request, res: Response): void => {
    res.status(200).json(getPerformanceSummary());
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/metrics/raw – raw metric reports (DM only)
// ---------------------------------------------------------------------------

router.get(
  '/raw',
  authenticate,
  requirePermission('encounter:manage'),
  (_req: Request, res: Response): void => {
    res.status(200).json({ metrics: getAllMetrics() });
  },
);

export default router;
