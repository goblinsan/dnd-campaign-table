/**
 * Campaign data routes – encounter, NPC, map, notes, and character endpoints.
 *
 * All responses are filtered by the caller's role using the visibility guards
 * so that DM-private data never reaches PLAYER or TABLE clients.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth';
import { requirePermission } from '../middleware/requireRole';
import {
  filterEncounter,
  filterNpc,
  filterMap,
  filterNotes,
  filterCharacter,
} from '../filters/visibility';
import { AuthenticatedRequest, Role } from '../types';

const router = Router();

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

/**
 * GET /campaign/encounters/:encounterId
 * PLAYER / TABLE see only public fields; DM sees everything.
 */
router.get(
  '/encounters/:encounterId',
  authenticate,
  requirePermission('encounter:read:public'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const encounter = {
      id: req.params.encounterId as string,
      name: 'Goblin Ambush',
      description: 'A group of goblins blocks the road.',
      dmNotes: 'The leader will surrender if below 5 HP.',
      hiddenDetails: { reinforcements: true, secretExit: 'north wall' } as Record<string, unknown>,
    };
    res.status(200).json(filterEncounter(encounter, session.role as Role));
  },
);

/**
 * POST /campaign/encounters
 * Create a new encounter – DM only.
 */
router.post(
  '/encounters',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    res.status(201).json({ message: 'Encounter created', data: req.body });
  },
);

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

/**
 * GET /campaign/npcs/:npcId
 * Unrevealed NPCs return 404 for non-DM clients; hidden fields are stripped.
 */
router.get(
  '/npcs/:npcId',
  authenticate,
  requirePermission('npc:read:visible'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const npc = {
      id: req.params.npcId as string,
      name: 'Zara the Merchant',
      revealed: true,
      hiddenMotivation: 'secretly a spy',
      hiddenHp: 12,
      dmNotes: 'Knows about the thieves guild',
      publicDescription: 'A travelling merchant selling exotic goods.',
    };
    const filtered = filterNpc(npc, session.role as Role);
    if (!filtered) {
      res.status(404).json({ error: 'NPC not found or not revealed' });
      return;
    }
    res.status(200).json(filtered);
  },
);

/**
 * POST /campaign/npcs
 * Create / update NPC – DM only.
 */
router.post(
  '/npcs',
  authenticate,
  requirePermission('npc:manage'),
  (req: Request, res: Response): void => {
    res.status(201).json({ message: 'NPC created', data: req.body });
  },
);

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

/**
 * GET /campaign/map/:mapId
 * Hidden areas and DM overlay are stripped for non-DM clients.
 */
router.get(
  '/map/:mapId',
  authenticate,
  requirePermission('map:read:visible'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const map = {
      id: req.params.mapId as string,
      name: 'Dungeon Level 1',
      dmOverlay: { traps: [{ x: 3, y: 4 }] } as Record<string, unknown>,
      hiddenAreas: [{ id: 'area-x', name: 'Secret Chamber' }],
      areas: [
        { id: 'area-1', name: 'Entry Hall', revealed: true },
        { id: 'area-2', name: 'Dark Corridor', revealed: false },
        { id: 'area-3', name: 'Throne Room', revealed: true },
      ],
    };
    res.status(200).json(filterMap(map, session.role as Role));
  },
);

// ---------------------------------------------------------------------------
// DM Notes
// ---------------------------------------------------------------------------

/**
 * GET /campaign/notes
 * DM-private; all other roles receive 403 via requirePermission.
 */
router.get(
  '/notes',
  authenticate,
  requirePermission('notes:read:dm'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const notes = {
      sessionGoal: 'Lead players to the enchanted forest.',
      secretPlots: ['The innkeeper is a werewolf.'],
    };
    res.status(200).json(filterNotes(notes, session.role as Role));
  },
);

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/**
 * GET /campaign/characters/:characterId
 * TABLE clients are blocked. PLAYER clients may only read their own character.
 */
router.get(
  '/characters/:characterId',
  authenticate,
  requirePermission('character:read:own'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const character = {
      id: req.params.characterId as string,
      ownerId: (req.query.ownerId as string | undefined) ?? session.sub,
      name: 'Elara the Elf',
      class: 'Ranger',
      hp: 28,
    };
    const filtered = filterCharacter(character, session.role as Role, session.sub);
    if (!filtered) {
      res.status(403).json({ error: 'Access denied to this character' });
      return;
    }
    res.status(200).json(filtered);
  },
);

export default router;
