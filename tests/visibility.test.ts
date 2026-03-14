/**
 * Tests for server-side visibility filters (Issue #3).
 */

import { ROLES } from '../src/roles';
import {
  filterEncounter,
  filterNpc,
  filterMap,
  filterNotes,
  filterCharacter,
} from '../src/filters/visibility';
import { Encounter, Npc, GameMap, Notes, Character } from '../src/types';

// ---------------------------------------------------------------------------
// filterEncounter
// ---------------------------------------------------------------------------
describe('filterEncounter()', () => {
  const encounter: Encounter = {
    id: 'enc-1',
    name: 'Goblin Ambush',
    description: 'Goblins on the road.',
    dmNotes: 'Leader surrenders below 5 HP.',
    hiddenDetails: { reinforcements: true },
  };

  test('DM receives the full encounter object', () => {
    expect(filterEncounter(encounter, ROLES.DM)).toEqual(encounter);
  });

  test('PLAYER does not receive dmNotes or hiddenDetails', () => {
    const result = filterEncounter(encounter, ROLES.PLAYER) as Encounter;
    expect(result.dmNotes).toBeUndefined();
    expect(result.hiddenDetails).toBeUndefined();
    expect(result.name).toBe('Goblin Ambush');
  });

  test('TABLE does not receive dmNotes or hiddenDetails', () => {
    const result = filterEncounter(encounter, ROLES.TABLE) as Encounter;
    expect(result.dmNotes).toBeUndefined();
    expect(result.hiddenDetails).toBeUndefined();
  });

  test('handles null/undefined gracefully', () => {
    expect(filterEncounter(null, ROLES.PLAYER)).toBeNull();
    expect(filterEncounter(undefined, ROLES.TABLE)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// filterNpc
// ---------------------------------------------------------------------------
describe('filterNpc()', () => {
  const revealedNpc: Npc = {
    id: 'npc-1',
    name: 'Zara',
    revealed: true,
    hiddenMotivation: 'spy',
    hiddenHp: 12,
    dmNotes: 'Guild contact',
    publicDescription: 'A merchant.',
  };
  const hiddenNpc: Npc = { ...revealedNpc, revealed: false };

  test('DM receives the full NPC including hidden fields', () => {
    expect(filterNpc(revealedNpc, ROLES.DM)).toEqual(revealedNpc);
    expect(filterNpc(hiddenNpc, ROLES.DM)).toEqual(hiddenNpc);
  });

  test('PLAYER receives only public fields of a revealed NPC', () => {
    const result = filterNpc(revealedNpc, ROLES.PLAYER) as Npc;
    expect(result).not.toBeNull();
    expect(result.hiddenMotivation).toBeUndefined();
    expect(result.hiddenHp).toBeUndefined();
    expect(result.dmNotes).toBeUndefined();
    expect(result.name).toBe('Zara');
  });

  test('PLAYER receives null for an unrevealed NPC', () => {
    expect(filterNpc(hiddenNpc, ROLES.PLAYER)).toBeNull();
  });

  test('TABLE receives null for an unrevealed NPC', () => {
    expect(filterNpc(hiddenNpc, ROLES.TABLE)).toBeNull();
  });

  test('TABLE receives only public fields of a revealed NPC', () => {
    const result = filterNpc(revealedNpc, ROLES.TABLE) as Npc;
    expect(result).not.toBeNull();
    expect(result.hiddenMotivation).toBeUndefined();
    expect(result.hiddenHp).toBeUndefined();
  });

  test('handles null/undefined gracefully', () => {
    expect(filterNpc(null, ROLES.PLAYER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterMap
// ---------------------------------------------------------------------------
describe('filterMap()', () => {
  const map: GameMap = {
    id: 'map-1',
    name: 'Dungeon L1',
    dmOverlay: { traps: [] },
    hiddenAreas: [{ id: 'secret' }],
    areas: [
      { id: 'a1', revealed: true },
      { id: 'a2', revealed: false },
    ],
  };

  test('DM receives the full map', () => {
    expect(filterMap(map, ROLES.DM)).toEqual(map);
  });

  test('PLAYER receives only revealed areas, no dmOverlay or hiddenAreas', () => {
    const result = filterMap(map, ROLES.PLAYER) as GameMap;
    expect(result.dmOverlay).toBeUndefined();
    expect(result.hiddenAreas).toBeUndefined();
    expect(result.areas).toHaveLength(1);
    expect(result.areas![0].id).toBe('a1');
  });

  test('TABLE receives only revealed areas, no DM-private fields', () => {
    const result = filterMap(map, ROLES.TABLE) as GameMap;
    expect(result.dmOverlay).toBeUndefined();
    expect(result.hiddenAreas).toBeUndefined();
    expect(result.areas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterNotes
// ---------------------------------------------------------------------------
describe('filterNotes()', () => {
  const notes: Notes = { sessionGoal: 'Reach the forest.', secretPlots: ['Innkeeper is a werewolf.'] };

  test('DM receives notes', () => {
    expect(filterNotes(notes, ROLES.DM)).toEqual(notes);
  });

  test('PLAYER receives null', () => {
    expect(filterNotes(notes, ROLES.PLAYER)).toBeNull();
  });

  test('TABLE receives null', () => {
    expect(filterNotes(notes, ROLES.TABLE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterCharacter
// ---------------------------------------------------------------------------
describe('filterCharacter()', () => {
  const character: Character = { id: 'char-1', ownerId: 'user-1', name: 'Elara', hp: 28 };

  test('DM receives any character', () => {
    expect(filterCharacter(character, ROLES.DM, 'dm-user')).toEqual(character);
  });

  test('PLAYER receives own character', () => {
    const result = filterCharacter(character, ROLES.PLAYER, 'user-1');
    expect(result).toEqual(character);
  });

  test("PLAYER receives null for another player's character", () => {
    expect(filterCharacter(character, ROLES.PLAYER, 'user-2')).toBeNull();
  });

  test('TABLE receives null regardless of character', () => {
    expect(filterCharacter(character, ROLES.TABLE, 'user-1')).toBeNull();
    expect(filterCharacter(character, ROLES.TABLE, 'user-2')).toBeNull();
  });

  test('handles null/undefined gracefully', () => {
    expect(filterCharacter(null, ROLES.PLAYER, 'user-1')).toBeNull();
  });
});
