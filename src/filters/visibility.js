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

const { ROLES } = require('../roles');

/**
 * Filter an encounter object for a given role.
 * Hidden DM notes and un-revealed encounter details are removed for
 * non-DM roles.
 *
 * @param {object} encounter
 * @param {string} role
 * @returns {object}
 */
function filterEncounter(encounter, role) {
  if (!encounter || typeof encounter !== 'object') return encounter;
  if (role === ROLES.DM) return encounter;

  const { dmNotes, hiddenDetails, ...publicFields } = encounter;
  return publicFields;
}

/**
 * Filter an NPC object for a given role.
 * Hidden state (e.g. secret motivations, undisclosed HP) is stripped for
 * non-DM roles.  NPCs that have not been revealed are omitted entirely.
 *
 * @param {object} npc
 * @param {string} role
 * @returns {object|null} – null means "do not include this NPC"
 */
function filterNpc(npc, role) {
  if (!npc || typeof npc !== 'object') return npc;
  if (role === ROLES.DM) return npc;

  if (!npc.revealed) return null;

  const { hiddenMotivation, hiddenHp, dmNotes, ...publicFields } = npc;
  return publicFields;
}

/**
 * Filter a map object for a given role.
 * Unexplored / DM-hidden areas are stripped for non-DM roles.
 *
 * @param {object} map
 * @param {string} role
 * @returns {object}
 */
function filterMap(map, role) {
  if (!map || typeof map !== 'object') return map;
  if (role === ROLES.DM) return map;

  const { hiddenAreas, dmOverlay, ...publicFields } = map;
  const visibleAreas = Array.isArray(map.areas)
    ? map.areas.filter((a) => a.revealed)
    : map.areas;
  return { ...publicFields, areas: visibleAreas };
}

/**
 * Filter a DM-notes object.
 * Non-DM roles receive null (no notes at all).
 *
 * @param {object|null} notes
 * @param {string} role
 * @returns {object|null}
 */
function filterNotes(notes, role) {
  if (role === ROLES.DM) return notes;
  return null;
}

/**
 * Filter a character-sheet object for a given role and requesting identity.
 * TABLE clients receive no character data.
 * PLAYER clients may only see their own character (matched by userId).
 *
 * @param {object} character
 * @param {string} role
 * @param {string} [requestingUserId]
 * @returns {object|null}
 */
function filterCharacter(character, role, requestingUserId) {
  if (!character || typeof character !== 'object') return character;
  if (role === ROLES.DM) return character;
  if (role === ROLES.TABLE) return null;

  // PLAYER: own sheet only
  if (character.ownerId === requestingUserId) return character;
  return null;
}

module.exports = {
  filterEncounter,
  filterNpc,
  filterMap,
  filterNotes,
  filterCharacter,
};
