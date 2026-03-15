/**
 * Feedback routes – Issue #17
 *
 * Players can submit post-session clarity/immersion feedback.
 * The DM can review all submitted feedback and capture post-session notes
 * for iterative improvements.
 *
 * Routes:
 *   POST /campaign/feedback            – submit player feedback (player/dm)
 *   GET  /campaign/feedback            – list all feedback (DM only)
 *   POST /campaign/feedback/notes      – add a post-session note (DM only)
 *   GET  /campaign/feedback/notes      – list all session notes (DM only)
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import { addFeedback, getFeedback, addSessionNote, getSessionNotes } from '../store';
import { AuthenticatedRequest, FeedbackEntry, SessionNote } from '../types';

const router = Router();

// ---------------------------------------------------------------------------
// POST /campaign/feedback – submit player feedback
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticate,
  requirePermission('session:read'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const { clarity, immersion, notes } = req.body ?? {};

    if (clarity !== undefined && (typeof clarity !== 'number' || clarity < 1 || clarity > 5)) {
      res.status(400).json({ error: "'clarity' must be a number between 1 and 5" });
      return;
    }
    if (immersion !== undefined && (typeof immersion !== 'number' || immersion < 1 || immersion > 5)) {
      res.status(400).json({ error: "'immersion' must be a number between 1 and 5" });
      return;
    }
    if (notes !== undefined && typeof notes !== 'string') {
      res.status(400).json({ error: "'notes' must be a string" });
      return;
    }

    const entry: FeedbackEntry = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: session.sub,
      sessionId: session.sid,
      ...(clarity !== undefined && { clarity }),
      ...(immersion !== undefined && { immersion }),
      ...(notes !== undefined && { notes }),
      submittedAt: Date.now(),
    };

    const stored = addFeedback(entry);
    res.status(201).json(stored);
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/feedback – list all feedback (DM only)
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requirePermission('notes:read:dm'),
  (req: Request, res: Response): void => {
    const sessionId = req.query.sessionId as string | undefined;
    res.status(200).json({ feedback: getFeedback(sessionId) });
  },
);

// ---------------------------------------------------------------------------
// POST /campaign/feedback/notes – add a DM session note
// ---------------------------------------------------------------------------

router.post(
  '/notes',
  authenticate,
  requirePermission('notes:write:dm'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const { content, sessionId } = req.body ?? {};

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: "'content' must be a non-empty string" });
      return;
    }

    const noteSessionId = sessionId ?? session.sid;
    if (typeof noteSessionId !== 'string') {
      res.status(400).json({ error: "'sessionId' must be a string" });
      return;
    }

    const note: SessionNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: noteSessionId,
      content,
      createdBy: session.sub,
      createdAt: Date.now(),
    };

    const stored = addSessionNote(note);
    res.status(201).json(stored);
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/feedback/notes – list DM session notes
// ---------------------------------------------------------------------------

router.get(
  '/notes',
  authenticate,
  requirePermission('notes:read:dm'),
  (req: Request, res: Response): void => {
    const sessionId = req.query.sessionId as string | undefined;
    res.status(200).json({ notes: getSessionNotes(sessionId) });
  },
);

export default router;
