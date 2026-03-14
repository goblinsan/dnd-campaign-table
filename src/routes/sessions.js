/**
 * Session routes
 *
 * POST /sessions/join  – obtain a role-scoped token
 * GET  /sessions/:id   – retrieve session info (authenticated)
 * DELETE /sessions/:id – end a session (DM only)
 */

const { Router } = require('express');
const { issueToken } = require('../auth');
const { authenticate } = require('../auth');
const { requirePermission } = require('../middleware/requireRole');
const { ROLES } = require('../roles');

const router = Router();

// In-memory store (replace with a real store in production)
const activeSessions = new Map();

/**
 * POST /sessions/join
 * Body: { userId, role, sessionId, dmPasscode? }
 *
 * The DM role requires a matching DM passcode to prevent privilege escalation.
 */
router.post('/join', (req, res) => {
  const { userId, role, sessionId, dmPasscode } = req.body || {};

  if (!userId || !role || !sessionId) {
    return res.status(400).json({ error: 'userId, role, and sessionId are required' });
  }

  if (!Object.values(ROLES).includes(role)) {
    return res.status(400).json({ error: `Invalid role: ${role}` });
  }

  // DM role requires a passcode to prevent privilege escalation
  if (role === ROLES.DM) {
    const expectedPasscode = process.env.DM_PASSCODE || 'dm-secret';
    if (dmPasscode !== expectedPasscode) {
      return res.status(403).json({ error: 'Invalid DM passcode' });
    }
  }

  try {
    const token = issueToken({ userId, role, sessionId });
    activeSessions.set(`${sessionId}:${userId}`, { userId, role, sessionId, joinedAt: Date.now() });
    return res.status(200).json({ token, role, sessionId });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /sessions/:id
 * Returns session metadata. Requires a valid token.
 */
router.get('/:id', authenticate, requirePermission('session:read'), (req, res) => {
  const { id } = req.params;
  const sessionEntries = [];
  for (const [key, val] of activeSessions) {
    if (val.sessionId === id) sessionEntries.push(val);
  }
  return res.status(200).json({ sessionId: id, participants: sessionEntries });
});

/**
 * DELETE /sessions/:id
 * Ends a session. DM only.
 */
router.delete('/:id', authenticate, requirePermission('session:manage'), (req, res) => {
  const { id } = req.params;
  for (const key of activeSessions.keys()) {
    if (key.startsWith(`${id}:`)) activeSessions.delete(key);
  }
  return res.status(200).json({ message: `Session ${id} ended` });
});

module.exports = router;
