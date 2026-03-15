/**
 * In-memory campaign state store.
 *
 * Holds mutable game state (map areas, encounters, NPC visibility) that the
 * DM can modify during a session.  Keyed by entity id so individual pieces
 * of state can be updated independently.
 *
 * In production this would be replaced by a persistent database.
 */

import { GameMap, MapArea, Encounter, Mob, InitiativeEntry, StatusEffect, Npc, AudioScene, FeedbackEntry, SessionNote, ClientMetric } from './types';

// ---------------------------------------------------------------------------
// Seed data – represents the initial campaign state
// ---------------------------------------------------------------------------

const defaultMaps: Map<string, GameMap> = new Map([
  [
    'map-1',
    {
      id: 'map-1',
      name: 'Dungeon Level 1',
      dmOverlay: { traps: [{ x: 3, y: 4 }] },
      hiddenAreas: [{ id: 'area-x', name: 'Secret Chamber' }],
      areas: [
        { id: 'area-1', name: 'Entry Hall', revealed: true },
        { id: 'area-2', name: 'Dark Corridor', revealed: false },
        { id: 'area-3', name: 'Throne Room', revealed: true },
      ],
    },
  ],
]);

const defaultEncounters: Map<string, Encounter> = new Map([
  [
    'enc-1',
    {
      id: 'enc-1',
      name: 'Goblin Ambush',
      description: 'A group of goblins blocks the road.',
      dmNotes: 'The leader will surrender if below 5 HP.',
      hiddenDetails: { reinforcements: true, secretExit: 'north wall' },
      mobs: [
        {
          id: 'mob-1',
          name: 'Goblin Leader',
          hp: 10,
          maxHp: 15,
          statusEffects: [],
          dmNotes: 'Surrender trigger: hp < 5',
        },
        {
          id: 'mob-2',
          name: 'Goblin Scout',
          hp: 6,
          maxHp: 6,
          statusEffects: [{ name: 'Frightened', duration: 2 }],
        },
      ],
      initiativeOrder: [
        { participantId: 'mob-1', name: 'Goblin Leader', initiative: 14, isPlayer: false },
        { participantId: 'player-1', name: 'Elara', initiative: 12, isPlayer: true },
        { participantId: 'mob-2', name: 'Goblin Scout', initiative: 8, isPlayer: false },
      ],
      round: 1,
      activeParticipantId: 'mob-1',
    },
  ],
]);

const defaultNpcs: Map<string, Npc> = new Map([
  [
    'npc-1',
    {
      id: 'npc-1',
      name: 'Zara the Merchant',
      revealed: true,
      hiddenMotivation: 'secretly a spy',
      hiddenHp: 12,
      dmNotes: 'Knows about the thieves guild',
      publicDescription: 'A travelling merchant selling exotic goods.',
    },
  ],
]);

// ---------------------------------------------------------------------------
// Live stores (copies of seed data so tests get a fresh state per import)
// ---------------------------------------------------------------------------

const maps: Map<string, GameMap> = new Map(
  [...defaultMaps.entries()].map(([k, v]) => [
    k,
    { ...v, areas: v.areas ? v.areas.map((a) => ({ ...a })) : v.areas },
  ]),
);

const encounters: Map<string, Encounter> = new Map(
  [...defaultEncounters.entries()].map(([k, v]) => [k, { ...v }]),
);

const npcs: Map<string, Npc> = new Map(
  [...defaultNpcs.entries()].map(([k, v]) => [k, { ...v }]),
);

// Soundscape store (Issue #16)
const audioScenes: Map<string, AudioScene> = new Map();
let activeSceneId: string | undefined;

// Feedback store (Issue #17)
const feedbackEntries: FeedbackEntry[] = [];
const sessionNotes: SessionNote[] = [];

// Performance Metrics store (Issue #18)
const clientMetrics: ClientMetric[] = [];

// ---------------------------------------------------------------------------
// Map state helpers
// ---------------------------------------------------------------------------

export function getMap(mapId: string): GameMap | undefined {
  return maps.get(mapId);
}

/**
 * Reveal or hide a specific area within a map.
 *
 * @returns The updated MapArea, or undefined when the map/area is not found.
 */
export function revealMapArea(mapId: string, areaId: string, revealed: boolean): MapArea | undefined {
  const map = maps.get(mapId);
  if (!map || !Array.isArray(map.areas)) return undefined;
  const area = map.areas.find((a) => a.id === areaId);
  if (!area) return undefined;
  area.revealed = revealed;
  return area;
}

// ---------------------------------------------------------------------------
// Encounter state helpers
// ---------------------------------------------------------------------------

export function getEncounter(encounterId: string): Encounter | undefined {
  return encounters.get(encounterId);
}

/**
 * Apply a partial update to an encounter (mobs, initiativeOrder, round, etc.).
 *
 * @returns The updated Encounter, or undefined when not found.
 */
export function updateEncounter(
  encounterId: string,
  patch: Partial<Pick<Encounter, 'mobs' | 'initiativeOrder' | 'round' | 'activeParticipantId'>>,
): Encounter | undefined {
  const encounter = encounters.get(encounterId);
  if (!encounter) return undefined;
  const updated: Encounter = { ...encounter, ...patch };
  encounters.set(encounterId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// NPC state helpers
// ---------------------------------------------------------------------------

export function getNpc(npcId: string): Npc | undefined {
  return npcs.get(npcId);
}

/**
 * Update an NPC's revealed flag and/or public description.
 *
 * @returns The updated Npc, or undefined when not found.
 */
export function updateNpc(
  npcId: string,
  patch: Partial<Pick<Npc, 'revealed' | 'publicDescription'>>,
): Npc | undefined {
  const npc = npcs.get(npcId);
  if (!npc) return undefined;
  const updated: Npc = { ...npc, ...patch };
  npcs.set(npcId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Soundscape helpers (Issue #16)
// ---------------------------------------------------------------------------

export function getAudioScene(sceneId: string): AudioScene | undefined {
  return audioScenes.get(sceneId);
}

export function listAudioScenes(): AudioScene[] {
  return [...audioScenes.values()];
}

/**
 * Create or fully replace an audio scene.
 *
 * @returns The stored AudioScene.
 */
export function upsertAudioScene(scene: AudioScene): AudioScene {
  audioScenes.set(scene.id, scene);
  return scene;
}

/**
 * Mark the given scene as the currently active/playing scene.
 *
 * @returns The activated AudioScene, or undefined when not found.
 */
export function activateAudioScene(sceneId: string): AudioScene | undefined {
  const scene = audioScenes.get(sceneId);
  if (!scene) return undefined;
  activeSceneId = sceneId;
  return scene;
}

/** Return the currently active scene, or undefined when none is set. */
export function getActiveAudioScene(): AudioScene | undefined {
  if (!activeSceneId) return undefined;
  return audioScenes.get(activeSceneId);
}

// ---------------------------------------------------------------------------
// Feedback helpers (Issue #17)
// ---------------------------------------------------------------------------

/**
 * Record a player feedback submission.
 *
 * @returns The stored FeedbackEntry.
 */
export function addFeedback(entry: FeedbackEntry): FeedbackEntry {
  feedbackEntries.push(entry);
  return entry;
}

/** Return all feedback entries, optionally filtered by sessionId. */
export function getFeedback(sessionId?: string): FeedbackEntry[] {
  if (!sessionId) return [...feedbackEntries];
  return feedbackEntries.filter((e) => e.sessionId === sessionId);
}

/**
 * Add a DM-authored session note.
 *
 * @returns The stored SessionNote.
 */
export function addSessionNote(note: SessionNote): SessionNote {
  sessionNotes.push(note);
  return note;
}

/** Return all session notes, optionally filtered by sessionId. */
export function getSessionNotes(sessionId?: string): SessionNote[] {
  if (!sessionId) return [...sessionNotes];
  return sessionNotes.filter((n) => n.sessionId === sessionId);
}

// ---------------------------------------------------------------------------
// Performance Metrics helpers (Issue #18)
// ---------------------------------------------------------------------------

/**
 * Append a client performance metric report.
 *
 * @returns The stored ClientMetric.
 */
export function addClientMetric(metric: ClientMetric): ClientMetric {
  clientMetrics.push(metric);
  return metric;
}

/** Return all raw metric reports. */
export function getAllMetrics(): ClientMetric[] {
  return [...clientMetrics];
}

/**
 * Compute an aggregate performance summary across all recorded metrics.
 */
export function getPerformanceSummary(): {
  totalReports: number;
  averageLatencyMs: number;
  averageFps: number;
  clientBreakdown: Record<string, { count: number; averageLatencyMs: number; averageFps: number }>;
  lastReportAt?: number;
} {
  const breakdown: Record<
    string,
    { count: number; totalLatency: number; totalFps: number; latencyCount: number; fpsCount: number }
  > = {};

  let totalLatency = 0;
  let latencyCount = 0;
  let totalFps = 0;
  let fpsCount = 0;
  let lastReportAt: number | undefined;

  for (const m of clientMetrics) {
    if (!breakdown[m.clientType]) {
      breakdown[m.clientType] = { count: 0, totalLatency: 0, totalFps: 0, latencyCount: 0, fpsCount: 0 };
    }
    breakdown[m.clientType].count++;

    if (m.latencyMs !== undefined) {
      breakdown[m.clientType].totalLatency += m.latencyMs;
      breakdown[m.clientType].latencyCount++;
      totalLatency += m.latencyMs;
      latencyCount++;
    }
    if (m.fps !== undefined) {
      breakdown[m.clientType].totalFps += m.fps;
      breakdown[m.clientType].fpsCount++;
      totalFps += m.fps;
      fpsCount++;
    }
    if (lastReportAt === undefined || m.reportedAt > lastReportAt) {
      lastReportAt = m.reportedAt;
    }
  }

  const clientBreakdown: Record<string, { count: number; averageLatencyMs: number; averageFps: number }> = {};
  for (const [type, data] of Object.entries(breakdown)) {
    clientBreakdown[type] = {
      count: data.count,
      averageLatencyMs: data.latencyCount > 0 ? Math.round(data.totalLatency / data.latencyCount) : 0,
      averageFps: data.fpsCount > 0 ? Math.round(data.totalFps / data.fpsCount) : 0,
    };
  }

  return {
    totalReports: clientMetrics.length,
    averageLatencyMs: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
    averageFps: fpsCount > 0 ? Math.round(totalFps / fpsCount) : 0,
    clientBreakdown,
    ...(lastReportAt !== undefined && { lastReportAt }),
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Reset all stores back to seed data.  Used by tests to ensure isolation.
 */
export function resetStore(): void {
  maps.clear();
  for (const [k, v] of defaultMaps.entries()) {
    maps.set(k, { ...v, areas: v.areas ? v.areas.map((a) => ({ ...a })) : v.areas });
  }
  encounters.clear();
  for (const [k, v] of defaultEncounters.entries()) {
    encounters.set(k, { ...v });
  }
  npcs.clear();
  for (const [k, v] of defaultNpcs.entries()) {
    npcs.set(k, { ...v });
  }
  audioScenes.clear();
  activeSceneId = undefined;
  feedbackEntries.length = 0;
  sessionNotes.length = 0;
  clientMetrics.length = 0;
}

// Re-export types used by store consumers
export type { Mob, InitiativeEntry, StatusEffect };
