/**
 * Soundscape routes – Issue #16
 *
 * Allows the DM to manage and trigger ambient music / SFX scenes keyed
 * by location or encounter.  Any authenticated role can read the currently
 * active scene so that all clients can synchronise playback.
 *
 * Routes:
 *   GET    /campaign/soundscape                 – list all audio scenes (DM)
 *   GET    /campaign/soundscape/active          – get the currently active scene (any role)
 *   GET    /campaign/soundscape/:sceneId        – get a single audio scene (DM)
 *   PUT    /campaign/soundscape/:sceneId        – create/replace an audio scene (DM)
 *   POST   /campaign/soundscape/:sceneId/activate – activate a scene (DM)
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import {
  getAudioScene,
  listAudioScenes,
  upsertAudioScene,
  activateAudioScene,
  getActiveAudioScene,
} from '../store';
import { AudioScene, AudioSceneType } from '../types';

const router = Router();

const VALID_SCENE_TYPES: ReadonlySet<AudioSceneType> = new Set(['ambient', 'encounter', 'sfx']);

// ---------------------------------------------------------------------------
// GET /campaign/soundscape – list all scenes (DM only)
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requirePermission('encounter:manage'),
  (_req: Request, res: Response): void => {
    res.status(200).json({ scenes: listAudioScenes() });
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/soundscape/active – get currently active scene (any role)
// ---------------------------------------------------------------------------

router.get(
  '/active',
  authenticate,
  requirePermission('session:read'),
  (_req: Request, res: Response): void => {
    const scene = getActiveAudioScene();
    if (!scene) {
      res.status(200).json({ active: null });
      return;
    }
    res.status(200).json({ active: scene });
  },
);

// ---------------------------------------------------------------------------
// GET /campaign/soundscape/:sceneId – get single scene (DM only)
// ---------------------------------------------------------------------------

router.get(
  '/:sceneId',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const scene = getAudioScene(req.params.sceneId as string);
    if (!scene) {
      res.status(404).json({ error: `Audio scene '${req.params.sceneId}' not found` });
      return;
    }
    res.status(200).json(scene);
  },
);

// ---------------------------------------------------------------------------
// PUT /campaign/soundscape/:sceneId – create or replace a scene (DM only)
//
// Body: { name, type, tracks, associatedLocationId?, associatedEncounterId?, transitionMs? }
// ---------------------------------------------------------------------------

router.put(
  '/:sceneId',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const { sceneId } = req.params;
    const { name, type, tracks, associatedLocationId, associatedEncounterId, transitionMs } =
      req.body ?? {};

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: "'name' must be a non-empty string" });
      return;
    }
    if (!VALID_SCENE_TYPES.has(type)) {
      res.status(400).json({
        error: `'type' must be one of: ${[...VALID_SCENE_TYPES].join(', ')}`,
      });
      return;
    }
    if (!Array.isArray(tracks)) {
      res.status(400).json({ error: "'tracks' must be an array" });
      return;
    }
    if (transitionMs !== undefined && (typeof transitionMs !== 'number' || transitionMs < 0)) {
      res.status(400).json({ error: "'transitionMs' must be a non-negative number" });
      return;
    }

    const scene: AudioScene = {
      id: sceneId as string,
      name,
      type: type as AudioSceneType,
      tracks,
      ...(associatedLocationId !== undefined && { associatedLocationId }),
      ...(associatedEncounterId !== undefined && { associatedEncounterId }),
      ...(transitionMs !== undefined && { transitionMs }),
    };

    const stored = upsertAudioScene(scene);
    res.status(200).json(stored);
  },
);

// ---------------------------------------------------------------------------
// POST /campaign/soundscape/:sceneId/activate – activate a scene (DM only)
// ---------------------------------------------------------------------------

router.post(
  '/:sceneId/activate',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const { sceneId } = req.params;
    const scene = activateAudioScene(sceneId as string);
    if (!scene) {
      res.status(404).json({ error: `Audio scene '${sceneId}' not found` });
      return;
    }
    res.status(200).json({ message: `Scene '${sceneId}' activated`, scene });
  },
);

export default router;
