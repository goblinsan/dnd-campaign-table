/**
 * Server-side visibility guards for DM-private content.
 *
 * These pure-function filters strip fields that must not be forwarded to
 * PLAYER or TABLE clients.  They are intentionally applied on the server
 * before serialisation so that no amount of client-side inspection can
 * reveal hidden data.
 *
 * Roles and the content they may receive:
 *
 *   DM     – full objects, nothing stripped
 *   PLAYER – public encounter info, revealed NPCs only, visible map areas,
 *             own character; DM notes / hidden fields removed
 *   TABLE  – same as PLAYER minus character-sheet data
 */

import { ROLES } from '../roles';
import { Role, Encounter, Mob, Npc, GameMap, MapArea, Notes, Character } from '../types';

/**
 * Filter an encounter object for a given role.
 * Hidden DM notes and un-revealed encounter details are removed for
 * non-DM roles.  Per-mob DM notes are also stripped.
 */
export function filterEncounter(encounter: Encounter | null | undefined, role: Role): Encounter | null | undefined {
  if (!encounter || typeof encounter !== 'object') return encounter;
  if (role === ROLES.DM) return encounter;

  const { dmNotes: _dmNotes, hiddenDetails: _hiddenDetails, ...publicFields } = encounter;

  // Strip per-mob DM notes so they never reach PLAYER or TABLE clients
  const filteredMobs: Array<Omit<Mob, 'dmNotes'>> | undefined = Array.isArray(encounter.mobs)
    ? encounter.mobs.map(({ dmNotes: _mn, ...publicMobFields }) => publicMobFields)
    : encounter.mobs;

  return { ...publicFields, ...(filteredMobs !== undefined ? { mobs: filteredMobs } : {}) };
}

/**
 * Filter an NPC object for a given role.
 * Hidden state (e.g. secret motivations, undisclosed HP) is stripped for
 * non-DM roles.  NPCs that have not been revealed are omitted entirely.
 *
 * @returns null when the NPC should not be included in the response
 */
export function filterNpc(npc: Npc | null | undefined, role: Role): Npc | null | undefined {
  if (!npc || typeof npc !== 'object') return npc;
  if (role === ROLES.DM) return npc;

  if (!npc.revealed) return null;

  const { hiddenMotivation: _hm, hiddenHp: _hhp, dmNotes: _dn, ...publicFields } = npc;
  return publicFields;
}

/**
 * Filter a map object for a given role.
 * Unexplored / DM-hidden areas are stripped for non-DM roles.
 */
export function filterMap(map: GameMap | null | undefined, role: Role): GameMap | null | undefined {
  if (!map || typeof map !== 'object') return map;
  if (role === ROLES.DM) return map;

  const { hiddenAreas: _ha, dmOverlay: _do, ...publicFields } = map;
  const visibleAreas: MapArea[] | undefined = Array.isArray(map.areas)
    ? map.areas.filter((a: MapArea) => a.revealed)
    : map.areas;
  return { ...publicFields, areas: visibleAreas };
}

/**
 * Filter a DM-notes object.
 * Non-DM roles receive null (no notes at all).
 */
export function filterNotes(notes: Notes | null, role: Role): Notes | null {
  if (role === ROLES.DM) return notes;
  return null;
}

/**
 * Filter a character-sheet object for a given role and requesting identity.
 * TABLE clients receive no character data.
 * PLAYER clients may only see their own character (matched by userId).
 */
export function filterCharacter(
  character: Character | null | undefined,
  role: Role,
  requestingUserId?: string,
): Character | null | undefined {
  if (!character || typeof character !== 'object') return character;
  if (role === ROLES.DM) return character;
  if (role === ROLES.TABLE) return null;

  // PLAYER: own sheet only
  if (character.ownerId === requestingUserId) return character;
  return null;
}
