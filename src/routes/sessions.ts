/**
 * Session routes
 *
 * POST /sessions/join  – obtain a role-scoped token
 * GET  /sessions/:id   – retrieve session info (authenticated)
 * DELETE /sessions/:id – end a session (DM only)
 */

import { Router, Request, Response } from 'express';
import { issueToken, authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import { ROLES } from '../roles';
import { AuthenticatedRequest, SessionEntry, Role } from '../types';

const router = Router();

// In-memory store (replace with a real store in production)
const activeSessions = new Map<string, SessionEntry>();

/**
 * POST /sessions/join
 * Body: { userId, role, sessionId, dmPasscode? }
 *
 * The DM role requires a matching DM passcode to prevent privilege escalation.
 */
router.post('/join', (req: Request, res: Response): void => {
  const { userId, role, sessionId, dmPasscode } = (req.body ?? {}) as {
    userId?: string;
    role?: string;
    sessionId?: string;
    dmPasscode?: string;
  };

  if (!userId || !role || !sessionId) {
    res.status(400).json({ error: 'userId, role, and sessionId are required' });
    return;
  }

  if (!(Object.values(ROLES) as string[]).includes(role)) {
    res.status(400).json({ error: `Invalid role: ${role}` });
    return;
  }

  // DM role requires a passcode to prevent privilege escalation
  if (role === ROLES.DM) {
    const expectedPasscode = process.env.DM_PASSCODE ?? 'dm-secret';
    if (dmPasscode !== expectedPasscode) {
      res.status(403).json({ error: 'Invalid DM passcode' });
      return;
    }
  }

  try {
    const token = issueToken({ userId, role, sessionId });
    activeSessions.set(`${sessionId}:${userId}`, {
      userId,
      role: role as Role,
      sessionId,
      joinedAt: Date.now(),
    });
    res.status(200).json({ token, role, sessionId });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /sessions/:id
 * Returns session metadata. Requires a valid token.
 */
router.get('/:id', authenticate, requirePermission('session:read'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const sessionEntries: SessionEntry[] = [];
  for (const val of activeSessions.values()) {
    if (val.sessionId === id) sessionEntries.push(val);
  }
  res.status(200).json({ sessionId: id, participants: sessionEntries });
});

/**
 * DELETE /sessions/:id
 * Ends a session. DM only.
 */
router.delete('/:id', authenticate, requirePermission('session:manage'), (req: Request, res: Response): void => {
  const { id } = req.params;
  for (const key of activeSessions.keys()) {
    if (key.startsWith(`${id}:`)) activeSessions.delete(key);
  }
  res.status(200).json({ message: `Session ${id} ended` });
});

export default router;
