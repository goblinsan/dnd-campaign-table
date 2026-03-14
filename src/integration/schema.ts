/**
 * Integration schema – Issue #11
 *
 * Canonical mapping between the external campaign builder data model and the
 * D&D table runtime consumption model.
 *
 * Builder entities are the "source of truth" produced by the campaign builder
 * tool.  Mapping functions convert them into the table runtime types so that
 * the rest of the application never depends on builder-specific field names.
 */

import { Character, Npc, Mob, StatusEffect } from '../types';

// ---------------------------------------------------------------------------
// Builder-side entity types (campaign builder output format)
// ---------------------------------------------------------------------------

/** Entity types supported by the integration layer. */
export type EntityType = 'character' | 'npc' | 'mob' | 'location' | 'world';

export interface BuilderCharacter {
  /** Unique identifier in the builder system. */
  builderId: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
  currentHp?: number;
  /** ISO-8601 timestamp of the last builder update. */
  updatedAt: string;
}

export interface BuilderNpc {
  builderId: string;
  name: string;
  /** Whether the NPC has been formally introduced to players in the builder. */
  isPublic: boolean;
  motivation?: string;
  hitPoints?: number;
  dmNotes?: string;
  description?: string;
  updatedAt: string;
}

export interface BuilderMob {
  builderId: string;
  name: string;
  currentHp: number;
  maximumHp: number;
  conditions?: Array<{ name: string; roundsRemaining?: number }>;
  dmNotes?: string;
  updatedAt: string;
}

export interface BuilderLocation {
  builderId: string;
  name: string;
  description?: string;
  /** Area IDs that are visible to players. */
  revealedAreaIds?: string[];
  areas?: Array<{ id: string; name?: string; isRevealed: boolean }>;
  dmNotes?: string;
  updatedAt: string;
}

export interface BuilderWorld {
  builderId: string;
  name: string;
  setting?: string;
  lore?: string;
  dmNotes?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

/** Describes a schema validation failure when builder data does not conform. */
export interface SchemaValidationError {
  entityType: EntityType;
  entityId: string;
  missingFields: string[];
  message: string;
}

/**
 * Validate a raw object against the required fields for a given entity type.
 * Returns a validation error when required fields are absent, or null when
 * the object passes validation.
 */
export function validateBuilderEntity(
  entityType: EntityType,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>,
): SchemaValidationError | null {
  const required: Record<EntityType, string[]> = {
    character: ['builderId', 'playerName', 'characterName', 'updatedAt'],
    npc: ['builderId', 'name', 'isPublic', 'updatedAt'],
    mob: ['builderId', 'name', 'currentHp', 'maximumHp', 'updatedAt'],
    location: ['builderId', 'name', 'updatedAt'],
    world: ['builderId', 'name', 'updatedAt'],
  };

  const missing = required[entityType].filter((f) => raw[f] === undefined || raw[f] === null);
  if (missing.length === 0) return null;

  return {
    entityType,
    entityId,
    missingFields: missing,
    message: `Builder entity '${entityId}' (${entityType}) is missing required fields: ${missing.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Mapping functions – builder → table runtime model
// ---------------------------------------------------------------------------

/**
 * Map a builder character record to the table runtime Character model.
 * The builder's `builderId` becomes the runtime `id`; the builder's
 * `playerName` is stored as `ownerId` so players can claim their sheet.
 */
export function mapBuilderCharacter(bc: BuilderCharacter): Character {
  return {
    id: bc.builderId,
    ownerId: bc.playerName,
    name: bc.characterName,
    ...(bc.characterClass !== undefined && { class: bc.characterClass }),
    ...(bc.currentHp !== undefined && { hp: bc.currentHp }),
  };
}

/**
 * Map a builder NPC record to the table runtime Npc model.
 * The builder's `isPublic` flag becomes the runtime `revealed` flag.
 */
export function mapBuilderNpc(bn: BuilderNpc): Npc {
  return {
    id: bn.builderId,
    name: bn.name,
    revealed: bn.isPublic,
    ...(bn.motivation !== undefined && { hiddenMotivation: bn.motivation }),
    ...(bn.hitPoints !== undefined && { hiddenHp: bn.hitPoints }),
    ...(bn.dmNotes !== undefined && { dmNotes: bn.dmNotes }),
    ...(bn.description !== undefined && { publicDescription: bn.description }),
  };
}

/**
 * Map a builder mob record to the table runtime Mob model.
 * Builder `conditions` are translated to runtime `statusEffects`.
 */
export function mapBuilderMob(bm: BuilderMob): Mob {
  const statusEffects: StatusEffect[] = (bm.conditions ?? []).map((c) => ({
    name: c.name,
    ...(c.roundsRemaining !== undefined && { duration: c.roundsRemaining }),
  }));

  return {
    id: bm.builderId,
    name: bm.name,
    hp: bm.currentHp,
    maxHp: bm.maximumHp,
    statusEffects,
    ...(bm.dmNotes !== undefined && { dmNotes: bm.dmNotes }),
  };
}
