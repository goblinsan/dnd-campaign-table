/**
 * Integration tests for role-boundary enforcement on API routes (Issue #4).
 *
 * These tests verify that restricted data NEVER reaches unauthorized clients,
 * guarding against role-boundary regressions.
 */

import request from 'supertest';
import app from '../src/app';
import { issueToken } from '../src/auth';
import { ROLES } from '../src/roles';
import { Role } from '../src/types';

function makeToken(role: Role, userId = 'user-1', sessionId = 'sess-1'): string {
  return issueToken({ userId, role, sessionId });
}

// ---------------------------------------------------------------------------
// POST /sessions/join
// ---------------------------------------------------------------------------
describe('POST /sessions/join', () => {
  test('DM can join with correct passcode', async () => {
    const res = await request(app)
      .post('/sessions/join')
      .send({ userId: 'dm-1', role: ROLES.DM, sessionId: 'sess-1', dmPasscode: 'dm-secret' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.role).toBe(ROLES.DM);
  });

  test('DM join is rejected with wrong passcode', async () => {
    const res = await request(app)
      .post('/sessions/join')
      .send({ userId: 'dm-1', role: ROLES.DM, sessionId: 'sess-1', dmPasscode: 'wrong' });
    expect(res.status).toBe(403);
  });

  test('PLAYER can join without passcode', async () => {
    const res = await request(app)
      .post('/sessions/join')
      .send({ userId: 'player-1', role: ROLES.PLAYER, sessionId: 'sess-1' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(ROLES.PLAYER);
  });

  test('TABLE can join without passcode', async () => {
    const res = await request(app)
      .post('/sessions/join')
      .send({ userId: 'table-1', role: ROLES.TABLE, sessionId: 'sess-1' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(ROLES.TABLE);
  });

  test('rejects unknown role', async () => {
    const res = await request(app)
      .post('/sessions/join')
      .send({ userId: 'u', role: 'god', sessionId: 's' });
    expect(res.status).toBe(400);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/sessions/join').send({ userId: 'u' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /sessions/:id
// ---------------------------------------------------------------------------
describe('GET /sessions/:id', () => {
  test('authenticated request returns session info', async () => {
    const token = makeToken(ROLES.DM, 'dm-1');
    const res = await request(app)
      .get('/sessions/sess-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('sess-1');
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/sessions/sess-1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id (DM only)
// ---------------------------------------------------------------------------
describe('DELETE /sessions/:id', () => {
  test('DM can end a session', async () => {
    const token = makeToken(ROLES.DM, 'dm-1');
    const res = await request(app)
      .delete('/sessions/sess-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('PLAYER cannot end a session (403)', async () => {
    const token = makeToken(ROLES.PLAYER, 'player-1');
    const res = await request(app)
      .delete('/sessions/sess-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE cannot end a session (403)', async () => {
    const token = makeToken(ROLES.TABLE, 'table-1');
    const res = await request(app)
      .delete('/sessions/sess-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/encounters/:id  – DM private fields must not leak
// ---------------------------------------------------------------------------
describe('GET /campaign/encounters/:id', () => {
  test('DM receives full encounter including dmNotes and hiddenDetails', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dmNotes).toBeDefined();
    expect(res.body.hiddenDetails).toBeDefined();
  });

  test('PLAYER does not receive dmNotes or hiddenDetails', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dmNotes).toBeUndefined();
    expect(res.body.hiddenDetails).toBeUndefined();
  });

  test('TABLE does not receive dmNotes or hiddenDetails', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dmNotes).toBeUndefined();
    expect(res.body.hiddenDetails).toBeUndefined();
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/encounters/enc-1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /campaign/encounters  – DM only
// ---------------------------------------------------------------------------
describe('POST /campaign/encounters', () => {
  test('DM can create an encounter', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/encounters')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Encounter' });
    expect(res.status).toBe(201);
  });

  test('PLAYER cannot create an encounter (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/encounters')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fake Encounter' });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot create an encounter (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .post('/campaign/encounters')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fake Encounter' });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/npcs/:id  – hidden NPC fields must not leak
// ---------------------------------------------------------------------------
describe('GET /campaign/npcs/:id', () => {
  test('DM receives full NPC data including hidden fields', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenMotivation).toBeDefined();
    expect(res.body.hiddenHp).toBeDefined();
    expect(res.body.dmNotes).toBeDefined();
  });

  test('PLAYER does not receive hidden NPC fields', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenMotivation).toBeUndefined();
    expect(res.body.hiddenHp).toBeUndefined();
    expect(res.body.dmNotes).toBeUndefined();
  });

  test('TABLE does not receive hidden NPC fields', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenMotivation).toBeUndefined();
    expect(res.body.hiddenHp).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/notes  – DM only
// ---------------------------------------------------------------------------
describe('GET /campaign/notes', () => {
  test('DM can read notes', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionGoal).toBeDefined();
  });

  test('PLAYER is forbidden from reading DM notes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE is forbidden from reading DM notes (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/map/:id  – hidden areas must not leak
// ---------------------------------------------------------------------------
describe('GET /campaign/map/:id', () => {
  test('DM receives full map including hiddenAreas and dmOverlay', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/map/map-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenAreas).toBeDefined();
    expect(res.body.dmOverlay).toBeDefined();
    expect(res.body.areas).toHaveLength(3);
  });

  test('PLAYER receives only revealed map areas and no DM fields', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/map/map-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenAreas).toBeUndefined();
    expect(res.body.dmOverlay).toBeUndefined();
    expect(res.body.areas.every((a: { revealed: boolean }) => a.revealed)).toBe(true);
  });

  test('TABLE receives only revealed map areas and no DM fields', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/map/map-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenAreas).toBeUndefined();
    expect(res.body.dmOverlay).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/characters/:id  – own-character access control
// ---------------------------------------------------------------------------
describe('GET /campaign/characters/:id', () => {
  test('DM can access any character', async () => {
    const token = makeToken(ROLES.DM, 'dm-1');
    const res = await request(app)
      .get('/campaign/characters/char-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('PLAYER can access their own character', async () => {
    const token = makeToken(ROLES.PLAYER, 'user-1');
    const res = await request(app)
      .get('/campaign/characters/char-1')
      .query({ ownerId: 'user-1' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("PLAYER cannot access another player's character (403)", async () => {
    const token = makeToken(ROLES.PLAYER, 'user-2');
    const res = await request(app)
      .get('/campaign/characters/char-1')
      .query({ ownerId: 'user-1' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE is forbidden from reading any character (403)', async () => {
    const token = makeToken(ROLES.TABLE, 'table-1');
    const res = await request(app)
      .get('/campaign/characters/char-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Token manipulation / edge cases
// ---------------------------------------------------------------------------
describe('Token security edge cases', () => {
  test('tampered token is rejected with 401', async () => {
    const token = makeToken(ROLES.DM);
    const [h, p] = token.split('.');
    const res = await request(app)
      .get('/campaign/notes')
      .set('Authorization', `Bearer ${h}.${p}.invalidsignature`);
    expect(res.status).toBe(401);
  });

  test('missing Authorization header is rejected with 401', async () => {
    const res = await request(app).get('/campaign/notes');
    expect(res.status).toBe(401);
  });

  test('malformed Authorization header is rejected with 401', async () => {
    const res = await request(app)
      .get('/campaign/notes')
      .set('Authorization', 'Token abc123');
    expect(res.status).toBe(401);
  });
});
