/**
 * Shared types and interfaces for the D&D Campaign Table app.
 */

import { Request } from 'express';

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

export type Role = 'dm' | 'player' | 'table';

export type Permission =
  | 'session:create'
  | 'session:read'
  | 'session:manage'
  | 'character:read:own'
  | 'character:read:all'
  | 'character:write'
  | 'encounter:read:public'
  | 'encounter:read:full'
  | 'encounter:manage'
  | 'npc:read:visible'
  | 'npc:read:full'
  | 'npc:manage'
  | 'notes:read:dm'
  | 'notes:write:dm'
  | 'map:read:visible'
  | 'map:read:full'
  | 'map:manage';

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

export interface TokenPayload {
  sub: string;
  role: Role;
  sid: string;
  iat: number;
  exp: number;
}

export interface IssueTokenParams {
  userId: string;
  role: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export interface MapArea {
  id: string;
  name?: string;
  revealed: boolean;
}

export interface StatusEffect {
  name: string;
  duration?: number;
}

export interface Mob {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  statusEffects: StatusEffect[];
  /** DM-only field: tactical notes for this mob. */
  dmNotes?: string;
}

export interface InitiativeEntry {
  participantId: string;
  name: string;
  initiative: number;
  /** True when this participant is a player character. */
  isPlayer: boolean;
}

export interface Encounter {
  id: string;
  name: string;
  description?: string;
  dmNotes?: string;
  hiddenDetails?: Record<string, unknown>;
  /** Combat participants (mobs). DM-only notes per mob are filtered for non-DM roles. */
  mobs?: Mob[];
  /** Current initiative order for all participants in this encounter. */
  initiativeOrder?: InitiativeEntry[];
  /** Current combat round number. */
  round?: number;
  /** ID of the participant whose turn it currently is. */
  activeParticipantId?: string;
}

export interface Npc {
  id: string;
  name: string;
  revealed: boolean;
  hiddenMotivation?: string;
  hiddenHp?: number;
  dmNotes?: string;
  publicDescription?: string;
}

export interface GameMap {
  id: string;
  name: string;
  dmOverlay?: Record<string, unknown>;
  hiddenAreas?: Array<{ id: string; name?: string }>;
  areas?: MapArea[];
}

export interface Notes {
  sessionGoal?: string;
  secretPlots?: string[];
}

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  class?: string;
  hp?: number;
}

export interface SessionEntry {
  userId: string;
  role: Role;
  sessionId: string;
  joinedAt: number;
}

// ---------------------------------------------------------------------------
// Soundscape (Issue #16)
// ---------------------------------------------------------------------------

export type AudioSceneType = 'ambient' | 'encounter' | 'sfx';

export interface AudioTrack {
  id: string;
  url: string;
  volume?: number;
  loop?: boolean;
}

export interface AudioScene {
  id: string;
  name: string;
  type: AudioSceneType;
  tracks: AudioTrack[];
  associatedLocationId?: string;
  associatedEncounterId?: string;
  /** Crossfade/transition duration in milliseconds. Defaults to 1000. */
  transitionMs?: number;
}

// ---------------------------------------------------------------------------
// Feedback (Issue #17)
// ---------------------------------------------------------------------------

export interface FeedbackEntry {
  id: string;
  userId: string;
  sessionId: string;
  /** Clarity rating 1–5. */
  clarity?: number;
  /** Immersion rating 1–5. */
  immersion?: number;
  notes?: string;
  submittedAt: number;
}

export interface SessionNote {
  id: string;
  sessionId: string;
  content: string;
  createdBy: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Performance Metrics (Issue #18)
// ---------------------------------------------------------------------------

export type ClientType = 'map' | 'table' | 'player' | 'dm';

export interface ClientMetric {
  id: string;
  clientType: ClientType;
  userId: string;
  sessionId: string;
  latencyMs?: number;
  fps?: number;
  reportedAt: number;
}

export interface PerformanceSummary {
  totalReports: number;
  averageLatencyMs: number;
  averageFps: number;
  clientBreakdown: Record<string, { count: number; averageLatencyMs: number; averageFps: number }>;
  lastReportAt?: number;
}

// ---------------------------------------------------------------------------
// Express request augmentation
// ---------------------------------------------------------------------------

export interface AuthenticatedRequest extends Request {
  session: TokenPayload;
}
