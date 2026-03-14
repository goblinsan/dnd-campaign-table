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
import { getMap, revealMapArea, getEncounter, updateEncounter, getNpc, updateNpc } from '../store';

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
    const encounter = getEncounter(req.params.encounterId as string) ?? {
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
 * PATCH /campaign/encounters/:encounterId
 * Update mobs, initiative order, round, and active participant – DM only.
 *
 * Accepted body fields: mobs, initiativeOrder, round, activeParticipantId
 */
router.patch(
  '/encounters/:encounterId',
  authenticate,
  requirePermission('encounter:manage'),
  (req: Request, res: Response): void => {
    const { encounterId } = req.params;
    const { mobs, initiativeOrder, round, activeParticipantId } = req.body ?? {};
    const updated = updateEncounter(encounterId as string, {
      ...(mobs !== undefined && { mobs }),
      ...(initiativeOrder !== undefined && { initiativeOrder }),
      ...(round !== undefined && { round }),
      ...(activeParticipantId !== undefined && { activeParticipantId }),
    });
    if (!updated) {
      res.status(404).json({ error: `Encounter '${encounterId}' not found` });
      return;
    }
    res.status(200).json(updated);
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
    const npc = getNpc(req.params.npcId as string) ?? {
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
 * PATCH /campaign/npcs/:npcId
 * Reveal an NPC to players or update public description – DM only.
 *
 * Accepted body fields: revealed (boolean), publicDescription (string)
 */
router.patch(
  '/npcs/:npcId',
  authenticate,
  requirePermission('npc:manage'),
  (req: Request, res: Response): void => {
    const { npcId } = req.params;
    const { revealed, publicDescription } = req.body ?? {};

    if (revealed !== undefined && typeof revealed !== 'boolean') {
      res.status(400).json({ error: "'revealed' must be a boolean" });
      return;
    }
    if (publicDescription !== undefined && typeof publicDescription !== 'string') {
      res.status(400).json({ error: "'publicDescription' must be a string" });
      return;
    }

    const updated = updateNpc(npcId as string, {
      ...(revealed !== undefined && { revealed }),
      ...(publicDescription !== undefined && { publicDescription }),
    });
    if (!updated) {
      res.status(404).json({ error: `NPC '${npcId}' not found` });
      return;
    }
    res.status(200).json(updated);
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
    const map = getMap(req.params.mapId as string) ?? {
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

/**
 * PATCH /campaign/map/:mapId/areas/:areaId
 * Reveal or hide a specific map area – DM only (fog-of-war control).
 *
 * Body: { revealed: boolean }
 */
router.patch(
  '/map/:mapId/areas/:areaId',
  authenticate,
  requirePermission('map:manage'),
  (req: Request, res: Response): void => {
    const { mapId, areaId } = req.params;
    const { revealed } = req.body ?? {};
    if (typeof revealed !== 'boolean') {
      res.status(400).json({ error: "'revealed' must be a boolean" });
      return;
    }
    const area = revealMapArea(mapId as string, areaId as string, revealed);
    if (!area) {
      res.status(404).json({ error: `Map '${mapId}' or area '${areaId}' not found` });
      return;
    }
    res.status(200).json(area);
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

// ---------------------------------------------------------------------------
// Table display view (issue #9)
// ---------------------------------------------------------------------------

/**
 * GET /campaign/view/table
 * Kiosk-friendly full-screen view for TV/table display.
 *
 * Returns aggregated public campaign data (visible map areas, public encounter
 * state, revealed NPCs) filtered to the caller's role.  Designed for TABLE
 * clients but accessible to any authenticated role.
 */
router.get(
  '/view/table',
  authenticate,
  requirePermission('session:read'),
  (req: Request, res: Response): void => {
    const session = (req as AuthenticatedRequest).session;
    const role = session.role as Role;

    const map = getMap('map-1') ?? {
      id: 'map-1',
      name: 'Dungeon Level 1',
      dmOverlay: {},
      hiddenAreas: [],
      areas: [{ id: 'area-1', name: 'Entry Hall', revealed: true }],
    };

    const encounter = getEncounter('enc-1') ?? {
      id: 'enc-1',
      name: 'Goblin Ambush',
      description: 'A group of goblins blocks the road.',
    };

    const npc = getNpc('npc-1') ?? {
      id: 'npc-1',
      name: 'Zara the Merchant',
      revealed: true,
      publicDescription: 'A travelling merchant selling exotic goods.',
    };

    res.status(200).json({
      map: filterMap(map, role),
      encounter: filterEncounter(encounter, role),
      npcs: [filterNpc(npc, role)].filter(Boolean),
    });
  },
);

export default router;
