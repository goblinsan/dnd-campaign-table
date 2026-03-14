/**
 * Role definitions and capability matrix for the D&D Campaign Table app.
 *
 * Three roles are supported:
 *   DM    – Dungeon Master: full access including hidden content
 *   PLAYER – A player character's owner: own-character data + visible game world
 *   TABLE  – Shared group/table display: public-only campaign content
 */

const ROLES = Object.freeze({
  DM: 'dm',
  PLAYER: 'player',
  TABLE: 'table',
});

/**
 * Capability matrix: maps each role to the set of named permissions it holds.
 *
 * Permissions used throughout the app:
 *   session:create         – start a new campaign session
 *   session:read           – view session info
 *   session:manage         – change session settings / end session
 *   character:read:own     – read own character sheet
 *   character:read:all     – read all character sheets
 *   character:write        – create / update character sheets
 *   encounter:read:public  – view publicly-revealed encounter info
 *   encounter:read:full    – view full encounter details (including hidden)
 *   encounter:manage       – create / update / delete encounters
 *   npc:read:visible       – view NPCs that have been revealed to players
 *   npc:read:full          – view all NPC data (including hidden state)
 *   npc:manage             – create / update NPC data
 *   notes:read:dm          – read DM-private notes
 *   notes:write:dm         – write DM-private notes
 *   map:read:visible       – view revealed map areas
 *   map:read:full          – view full map including hidden areas
 *   map:manage             – update map state
 */
const CAPABILITIES = Object.freeze({
  [ROLES.DM]: new Set([
    'session:create',
    'session:read',
    'session:manage',
    'character:read:own',
    'character:read:all',
    'character:write',
    'encounter:read:public',
    'encounter:read:full',
    'encounter:manage',
    'npc:read:visible',
    'npc:read:full',
    'npc:manage',
    'notes:read:dm',
    'notes:write:dm',
    'map:read:visible',
    'map:read:full',
    'map:manage',
  ]),
  [ROLES.PLAYER]: new Set([
    'session:read',
    'character:read:own',
    'character:write',
    'encounter:read:public',
    'npc:read:visible',
    'map:read:visible',
  ]),
  [ROLES.TABLE]: new Set([
    'session:read',
    'encounter:read:public',
    'npc:read:visible',
    'map:read:visible',
  ]),
});

/**
 * Returns true when the given role possesses the requested permission.
 *
 * @param {string} role       – one of ROLES.*
 * @param {string} permission – capability string
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const caps = CAPABILITIES[role];
  return caps !== undefined && caps.has(permission);
}

module.exports = { ROLES, CAPABILITIES, hasPermission };
