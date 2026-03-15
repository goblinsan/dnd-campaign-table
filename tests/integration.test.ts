/**
 * Integration tests for the Campaign Builder Integration Layer.
 *
 * Covers:
 *   Issue #11 – builder schema types and mapping functions
 *   Issue #12 – pull/sync service with caching, staleness, and retry
 *   Issue #13 – DM override and manual-refresh endpoints
 *   Issue #14 – health check endpoint and observability metrics
 */

import request from 'supertest';
import app from '../src/app';
import { issueToken } from '../src/auth';
import { ROLES } from '../src/roles';
import { Role } from '../src/types';
import { SyncService, syncService } from '../src/integration/syncService';
import {
  mapBuilderCharacter,
  mapBuilderNpc,
  mapBuilderMob,
  validateBuilderEntity,
  BuilderCharacter,
  BuilderNpc,
  BuilderMob,
} from '../src/integration/schema';

function makeToken(role: Role, userId = 'user-1', sessionId = 'sess-1'): string {
  return issueToken({ userId, role, sessionId });
}

beforeEach(() => {
  syncService.reset();
});

// ===========================================================================
// Issue #11 – Integration schema & mapping functions
// ===========================================================================

describe('mapBuilderCharacter()', () => {
  const builder: BuilderCharacter = {
    builderId: 'char-builder-1',
    playerName: 'alice',
    characterName: 'Elara the Elf',
    characterClass: 'Ranger',
    currentHp: 28,
    updatedAt: '2026-01-01T00:00:00Z',
  };

  test('maps builderId to id', () => {
    expect(mapBuilderCharacter(builder).id).toBe('char-builder-1');
  });

  test('maps playerName to ownerId', () => {
    expect(mapBuilderCharacter(builder).ownerId).toBe('alice');
  });

  test('maps characterName to name', () => {
    expect(mapBuilderCharacter(builder).name).toBe('Elara the Elf');
  });

  test('maps characterClass to class', () => {
    expect(mapBuilderCharacter(builder).class).toBe('Ranger');
  });

  test('maps currentHp to hp', () => {
    expect(mapBuilderCharacter(builder).hp).toBe(28);
  });

  test('omits optional fields when absent', () => {
    const minimal: BuilderCharacter = {
      builderId: 'c1',
      playerName: 'bob',
      characterName: 'Brom',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const result = mapBuilderCharacter(minimal);
    expect(result.class).toBeUndefined();
    expect(result.hp).toBeUndefined();
  });
});

describe('mapBuilderNpc()', () => {
  const builder: BuilderNpc = {
    builderId: 'npc-builder-1',
    name: 'Zara the Merchant',
    isPublic: true,
    motivation: 'secretly a spy',
    hitPoints: 12,
    dmNotes: 'Knows about the thieves guild',
    description: 'A travelling merchant.',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  test('maps builderId to id', () => {
    expect(mapBuilderNpc(builder).id).toBe('npc-builder-1');
  });

  test('maps isPublic to revealed', () => {
    expect(mapBuilderNpc(builder).revealed).toBe(true);
    expect(mapBuilderNpc({ ...builder, isPublic: false }).revealed).toBe(false);
  });

  test('maps motivation to hiddenMotivation', () => {
    expect(mapBuilderNpc(builder).hiddenMotivation).toBe('secretly a spy');
  });

  test('maps hitPoints to hiddenHp', () => {
    expect(mapBuilderNpc(builder).hiddenHp).toBe(12);
  });

  test('maps description to publicDescription', () => {
    expect(mapBuilderNpc(builder).publicDescription).toBe('A travelling merchant.');
  });
});

describe('mapBuilderMob()', () => {
  const builder: BuilderMob = {
    builderId: 'mob-builder-1',
    name: 'Goblin Leader',
    currentHp: 10,
    maximumHp: 15,
    conditions: [{ name: 'Frightened', roundsRemaining: 2 }],
    dmNotes: 'Will surrender at low HP',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  test('maps builderId to id', () => {
    expect(mapBuilderMob(builder).id).toBe('mob-builder-1');
  });

  test('maps currentHp / maximumHp to hp / maxHp', () => {
    const mob = mapBuilderMob(builder);
    expect(mob.hp).toBe(10);
    expect(mob.maxHp).toBe(15);
  });

  test('maps conditions to statusEffects with duration', () => {
    const mob = mapBuilderMob(builder);
    expect(mob.statusEffects).toHaveLength(1);
    expect(mob.statusEffects[0].name).toBe('Frightened');
    expect(mob.statusEffects[0].duration).toBe(2);
  });

  test('produces empty statusEffects when conditions absent', () => {
    const mob = mapBuilderMob({ ...builder, conditions: undefined });
    expect(mob.statusEffects).toHaveLength(0);
  });
});

describe('validateBuilderEntity()', () => {
  test('returns null when all required fields are present', () => {
    const raw = { builderId: 'n1', name: 'Zara', isPublic: true, updatedAt: '2026-01-01T00:00:00Z' };
    expect(validateBuilderEntity('npc', 'n1', raw)).toBeNull();
  });

  test('returns a validation error when required fields are missing', () => {
    const err = validateBuilderEntity('npc', 'n1', { builderId: 'n1' });
    expect(err).not.toBeNull();
    expect(err!.missingFields).toContain('name');
    expect(err!.missingFields).toContain('isPublic');
    expect(err!.missingFields).toContain('updatedAt');
  });

  test('validates character entities', () => {
    const err = validateBuilderEntity('character', 'c1', { builderId: 'c1' });
    expect(err!.missingFields).toContain('playerName');
    expect(err!.missingFields).toContain('characterName');
  });

  test('validates mob entities', () => {
    const err = validateBuilderEntity('mob', 'm1', { builderId: 'm1', name: 'G', updatedAt: '...' });
    expect(err!.missingFields).toContain('currentHp');
    expect(err!.missingFields).toContain('maximumHp');
  });

  test('validates location entities', () => {
    const err = validateBuilderEntity('location', 'l1', {});
    expect(err!.missingFields).toContain('builderId');
    expect(err!.missingFields).toContain('name');
  });

  test('validates world entities', () => {
    const raw = { builderId: 'w1', name: 'Faerûn', updatedAt: '2026-01-01T00:00:00Z' };
    expect(validateBuilderEntity('world', 'w1', raw)).toBeNull();
  });
});

// ===========================================================================
// Issue #12 – SyncService
// ===========================================================================

describe('SyncService – sync()', () => {
  test('successful sync stores entity in cache', async () => {
    const payload = { builderId: 'npc-1', name: 'Zara', isPublic: true, updatedAt: '2026-01-01T00:00:00Z' };
    const result = await syncService.sync('npc', 'npc-1', async () => payload);
    expect(result.success).toBe(true);
    expect(syncService.get('npc', 'npc-1')).toEqual(payload);
  });

  test('successful sync records durationMs', async () => {
    const result = await syncService.sync('character', 'c-1', async () => ({ builderId: 'c-1' }));
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('failed fetch returns success=false', async () => {
    const result = await syncService.sync(
      'mob',
      'm-1',
      async () => { throw new Error('network error'); },
      undefined,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('network error');
  });

  test('retries on failure and succeeds on later attempt', async () => {
    let attempts = 0;
    const result = await syncService.sync('npc', 'n-retry', async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return { builderId: 'n-retry', name: 'X', isPublic: false, updatedAt: '' };
    });
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);
  });

  test('schema validation failure is recorded as schemaMismatch', async () => {
    const result = await syncService.sync(
      'npc',
      'bad-npc',
      async () => ({ builderId: 'bad-npc' }), // missing required fields
      (raw) => validateBuilderEntity('npc', 'bad-npc', raw as Record<string, unknown>),
    );
    expect(result.success).toBe(false);
    expect(result.schemaError).toBeDefined();
    const health = syncService.getHealth();
    expect(health.schemaMismatchCount).toBe(1);
  });
});

describe('SyncService – isStale()', () => {
  test('returns true for an entity not yet synced', () => {
    expect(syncService.isStale('npc', 'npc-never')).toBe(true);
  });

  test('returns false immediately after a successful sync', async () => {
    await syncService.sync('npc', 'npc-fresh', async () => ({}));
    expect(syncService.isStale('npc', 'npc-fresh')).toBe(false);
  });

  test('returns true when stalenessMs threshold is exceeded', async () => {
    const staleService = new SyncService({ stalenessMs: 1 });
    await staleService.sync('npc', 'npc-old', async () => ({}));
    // Wait for 5 ms to exceed the 1 ms staleness threshold
    await new Promise((r) => setTimeout(r, 5));
    expect(staleService.isStale('npc', 'npc-old')).toBe(true);
  });
});

describe('SyncService – overrides', () => {
  test('setOverride takes precedence over cached builder data', async () => {
    await syncService.sync('npc', 'npc-1', async () => ({ name: 'From Builder' }));
    syncService.setOverride('npc', 'npc-1', { name: 'DM Override' });
    expect((syncService.get('npc', 'npc-1') as { name: string }).name).toBe('DM Override');
  });

  test('clearOverride restores cached builder data', async () => {
    await syncService.sync('npc', 'npc-1', async () => ({ name: 'From Builder' }));
    syncService.setOverride('npc', 'npc-1', { name: 'DM Override' });
    const removed = syncService.clearOverride('npc', 'npc-1');
    expect(removed).toBe(true);
    expect((syncService.get('npc', 'npc-1') as { name: string }).name).toBe('From Builder');
  });

  test('clearOverride returns false when no override exists', () => {
    expect(syncService.clearOverride('npc', 'does-not-exist')).toBe(false);
  });

  test('listOverrides returns all active overrides', () => {
    syncService.setOverride('npc', 'npc-1', {});
    syncService.setOverride('character', 'char-1', {});
    const overrides = syncService.listOverrides();
    expect(overrides).toHaveLength(2);
    expect(overrides.some((o) => o.entityType === 'npc' && o.entityId === 'npc-1')).toBe(true);
    expect(overrides.some((o) => o.entityType === 'character' && o.entityId === 'char-1')).toBe(true);
  });
});

describe('SyncService – health metrics (Issue #14)', () => {
  test('initial health shows all zeros', () => {
    const h = syncService.getHealth();
    expect(h.totalSyncs).toBe(0);
    expect(h.successCount).toBe(0);
    expect(h.failureCount).toBe(0);
    expect(h.schemaMismatchCount).toBe(0);
    expect(h.averageLatencyMs).toBe(0);
    expect(h.lastSyncAt).toBeUndefined();
  });

  test('health tracks successes and failures', async () => {
    await syncService.sync('npc', 'n1', async () => ({}));
    await syncService.sync('npc', 'n2', async () => { throw new Error('fail'); });

    const h = syncService.getHealth();
    expect(h.totalSyncs).toBe(2);
    expect(h.successCount).toBe(1);
    expect(h.failureCount).toBe(1);
    expect(h.lastSyncAt).toBeDefined();
    expect(h.averageLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// Issue #14 – GET /campaign/sync/health endpoint
// ===========================================================================

describe('GET /campaign/sync/health', () => {
  test('DM receives health snapshot', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app).get('/campaign/sync/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.totalSyncs).toBe('number');
    expect(typeof res.body.successCount).toBe('number');
    expect(typeof res.body.failureCount).toBe('number');
    expect(typeof res.body.schemaMismatchCount).toBe('number');
    expect(typeof res.body.averageLatencyMs).toBe('number');
  });

  test('PLAYER receives health snapshot', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app).get('/campaign/sync/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('TABLE receives health snapshot', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app).get('/campaign/sync/health').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/sync/health');
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Issue #13 – POST /campaign/sync/refresh (manual refresh)
// ===========================================================================

describe('POST /campaign/sync/refresh/:entityType/:entityId', () => {
  test('DM can refresh an NPC with a valid payload', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/sync/refresh/npc/npc-ext-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ builderId: 'npc-ext-1', name: 'Zara', isPublic: true, updatedAt: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('synced successfully');
  });

  test('returns 422 when payload fails schema validation', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/sync/refresh/npc/bad-npc')
      .set('Authorization', `Bearer ${token}`)
      .send({ builderId: 'bad-npc' }); // missing name, isPublic, updatedAt
    expect(res.status).toBe(422);
    expect(res.body.schemaError).toBeDefined();
  });

  test('returns 400 for an invalid entity type', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/sync/refresh/dragon/d-1')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('PLAYER cannot trigger a refresh (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/sync/refresh/npc/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ builderId: 'npc-1', name: 'X', isPublic: true, updatedAt: '' });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot trigger a refresh (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .post('/campaign/sync/refresh/npc/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ builderId: 'npc-1', name: 'X', isPublic: true, updatedAt: '' });
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .post('/campaign/sync/refresh/npc/npc-1')
      .send({ builderId: 'npc-1', name: 'X', isPublic: true, updatedAt: '' });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Issue #13 – Override management endpoints
// ===========================================================================

describe('GET /campaign/sync/overrides', () => {
  test('DM can list overrides (empty initially)', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/sync/overrides')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.overrides)).toBe(true);
    expect(res.body.overrides).toHaveLength(0);
  });

  test('lists overrides after PUT', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/sync/overrides/npc/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Custom NPC' });

    const res = await request(app)
      .get('/campaign/sync/overrides')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.overrides).toHaveLength(1);
    expect(res.body.overrides[0].entityType).toBe('npc');
    expect(res.body.overrides[0].entityId).toBe('npc-1');
  });

  test('PLAYER cannot list overrides (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/sync/overrides')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /campaign/sync/overrides/:entityType/:entityId', () => {
  test('DM can set an override', async () => {
    const token = makeToken(ROLES.DM, 'dm-user');
    const res = await request(app)
      .put('/campaign/sync/overrides/npc/npc-override-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Overridden NPC', hp: 99 });
    expect(res.status).toBe(200);
    expect(res.body.entityId).toBe('npc-override-1');
    expect(res.body.setBy).toBe('dm-user');
  });

  test('override is reflected in syncService.get()', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/sync/overrides/mob/mob-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ hp: 1, name: 'Dying Goblin' });
    const data = syncService.get('mob', 'mob-1') as { hp: number };
    expect(data.hp).toBe(1);
  });

  test('returns 400 for invalid entity type', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/sync/overrides/dragon/d-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dragon' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when body is not an object', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/sync/overrides/npc/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send([{ name: 'array body' }]);
    expect(res.status).toBe(400);
  });

  test('PLAYER cannot set overrides (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .put('/campaign/sync/overrides/npc/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'hack' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /campaign/sync/overrides/:entityType/:entityId', () => {
  test('DM can clear an existing override', async () => {
    const token = makeToken(ROLES.DM);

    // Set override first
    await request(app)
      .put('/campaign/sync/overrides/npc/npc-del')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Temp Override' });

    // Clear it
    const res = await request(app)
      .delete('/campaign/sync/overrides/npc/npc-del')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Override cleared');
  });

  test('returns 404 when no override exists', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .delete('/campaign/sync/overrides/npc/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid entity type', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .delete('/campaign/sync/overrides/dragon/d-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('PLAYER cannot clear overrides (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .delete('/campaign/sync/overrides/npc/npc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).delete('/campaign/sync/overrides/npc/npc-1');
    expect(res.status).toBe(401);
  });
});
