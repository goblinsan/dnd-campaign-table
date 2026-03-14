/**
 * Tests for the role definitions and capability matrix (Issue #1).
 */

import { ROLES, CAPABILITIES, hasPermission } from '../src/roles';
import { Permission } from '../src/types';

describe('ROLES', () => {
  test('defines DM, PLAYER, and TABLE roles', () => {
    expect(ROLES.DM).toBe('dm');
    expect(ROLES.PLAYER).toBe('player');
    expect(ROLES.TABLE).toBe('table');
  });

  test('ROLES is frozen (immutable)', () => {
    expect(Object.isFrozen(ROLES)).toBe(true);
  });
});

describe('CAPABILITIES matrix', () => {
  test('each role has a capability Set', () => {
    for (const role of Object.values(ROLES)) {
      expect(CAPABILITIES[role]).toBeInstanceOf(Set);
    }
  });

  test('CAPABILITIES is frozen', () => {
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
  });

  // DM permissions
  test('DM has full access', () => {
    const dmCaps = CAPABILITIES[ROLES.DM];
    expect(dmCaps.has('session:create')).toBe(true);
    expect(dmCaps.has('session:manage')).toBe(true);
    expect(dmCaps.has('encounter:read:full')).toBe(true);
    expect(dmCaps.has('npc:read:full')).toBe(true);
    expect(dmCaps.has('notes:read:dm')).toBe(true);
    expect(dmCaps.has('map:read:full')).toBe(true);
    expect(dmCaps.has('map:manage')).toBe(true);
  });

  // PLAYER permission boundaries
  test('PLAYER has public encounter access', () => {
    expect(CAPABILITIES[ROLES.PLAYER].has('encounter:read:public')).toBe(true);
  });

  test('PLAYER cannot access DM-restricted content', () => {
    const playerCaps = CAPABILITIES[ROLES.PLAYER];
    expect(playerCaps.has('encounter:read:full')).toBe(false);
    expect(playerCaps.has('npc:read:full')).toBe(false);
    expect(playerCaps.has('notes:read:dm')).toBe(false);
    expect(playerCaps.has('map:read:full')).toBe(false);
    expect(playerCaps.has('session:create')).toBe(false);
    expect(playerCaps.has('session:manage')).toBe(false);
    expect(playerCaps.has('encounter:manage')).toBe(false);
    expect(playerCaps.has('npc:manage')).toBe(false);
  });

  // TABLE permission boundaries
  test('TABLE has read-only public access', () => {
    const tableCaps = CAPABILITIES[ROLES.TABLE];
    expect(tableCaps.has('session:read')).toBe(true);
    expect(tableCaps.has('encounter:read:public')).toBe(true);
    expect(tableCaps.has('npc:read:visible')).toBe(true);
    expect(tableCaps.has('map:read:visible')).toBe(true);
  });

  test('TABLE cannot access any write or DM permissions', () => {
    const tableCaps = CAPABILITIES[ROLES.TABLE];
    expect(tableCaps.has('character:read:own')).toBe(false);
    expect(tableCaps.has('character:write')).toBe(false);
    expect(tableCaps.has('encounter:manage')).toBe(false);
    expect(tableCaps.has('npc:manage')).toBe(false);
    expect(tableCaps.has('notes:read:dm')).toBe(false);
    expect(tableCaps.has('map:manage')).toBe(false);
    expect(tableCaps.has('session:create')).toBe(false);
    expect(tableCaps.has('session:manage')).toBe(false);
  });
});

describe('hasPermission()', () => {
  test('returns true for a valid role + permission', () => {
    expect(hasPermission(ROLES.DM, 'notes:read:dm')).toBe(true);
    expect(hasPermission(ROLES.PLAYER, 'character:read:own')).toBe(true);
    expect(hasPermission(ROLES.TABLE, 'map:read:visible')).toBe(true);
  });

  test('returns false when role lacks the permission', () => {
    expect(hasPermission(ROLES.PLAYER, 'notes:read:dm')).toBe(false);
    expect(hasPermission(ROLES.TABLE, 'character:read:own')).toBe(false);
    expect(hasPermission(ROLES.TABLE, 'encounter:read:full')).toBe(false);
  });

  test('returns false for an unknown role', () => {
    expect(hasPermission('unknown', 'session:read')).toBe(false);
  });

  test('returns false for undefined inputs', () => {
    expect(hasPermission(undefined, 'session:read')).toBe(false);
    expect(hasPermission(ROLES.DM, undefined)).toBe(false);
  });
});
