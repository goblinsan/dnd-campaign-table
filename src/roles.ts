/**
 * Role definitions and capability matrix for the D&D Campaign Table app.
 *
 * Three roles are supported:
 *   DM    – Dungeon Master: full access including hidden content
 *   PLAYER – A player character's owner: own-character data + visible game world
 *   TABLE  – Shared group/table display: public-only campaign content
 */

import { Role, Permission } from './types';

export const ROLES = Object.freeze({
  DM: 'dm' as Role,
  PLAYER: 'player' as Role,
  TABLE: 'table' as Role,
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
export const CAPABILITIES: Readonly<Record<Role, ReadonlySet<Permission>>> = Object.freeze({
  dm: new Set<Permission>([
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
  player: new Set<Permission>([
    'session:read',
    'character:read:own',
    'character:write',
    'encounter:read:public',
    'npc:read:visible',
    'map:read:visible',
  ]),
  table: new Set<Permission>([
    'session:read',
    'encounter:read:public',
    'npc:read:visible',
    'map:read:visible',
  ]),
});

/**
 * Returns true when the given role possesses the requested permission.
 *
 * @param role       – one of ROLES.*
 * @param permission – capability string
 */
export function hasPermission(role: Role | string | undefined, permission: Permission | string | undefined): boolean {
  if (!role || !permission) return false;
  const caps = CAPABILITIES[role as Role];
  return caps !== undefined && caps.has(permission as Permission);
}
