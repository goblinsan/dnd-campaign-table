/**
 * Integration tests for the new Map, Encounter, NPC, and Table view endpoints.
 *
 * Covers:
 *   Issue #6 – map fog-of-war control (PATCH /campaign/map/:mapId/areas/:areaId)
 *   Issue #7 – encounter panel with mobs/initiative/status (GET + PATCH /campaign/encounters/:id)
 *   Issue #8 – NPC reveal / public description update (PATCH /campaign/npcs/:id)
 *   Issue #9 – kiosk table display view (GET /campaign/view/table)
 */

import request from 'supertest';
import app from '../src/app';
import { issueToken } from '../src/auth';
import { ROLES } from '../src/roles';
import { Role } from '../src/types';
import { resetStore } from '../src/store';

function makeToken(role: Role, userId = 'user-1', sessionId = 'sess-1'): string {
  return issueToken({ userId, role, sessionId });
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Issue #6 – PATCH /campaign/map/:mapId/areas/:areaId (fog-of-war control)
// ---------------------------------------------------------------------------
describe('PATCH /campaign/map/:mapId/areas/:areaId', () => {
  test('DM can reveal a hidden area', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('area-2');
    expect(res.body.revealed).toBe(true);
  });

  test('DM can hide a revealed area', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: false });
    expect(res.status).toBe(200);
    expect(res.body.revealed).toBe(false);
  });

  test('revealed change is reflected in subsequent GET for PLAYER', async () => {
    const dmToken = makeToken(ROLES.DM, 'dm-1');
    const playerToken = makeToken(ROLES.PLAYER, 'player-1');

    // Initially area-2 is hidden – player cannot see it
    const before = await request(app)
      .get('/campaign/map/map-1')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(before.status).toBe(200);
    expect(before.body.areas.find((a: { id: string }) => a.id === 'area-2')).toBeUndefined();

    // DM reveals area-2
    await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ revealed: true });

    // Now player can see it
    const after = await request(app)
      .get('/campaign/map/map-1')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(after.status).toBe(200);
    expect(after.body.areas.find((a: { id: string }) => a.id === 'area-2')).toBeDefined();
  });

  test('PLAYER cannot reveal map areas (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot reveal map areas (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(403);
  });

  test('returns 400 when revealed field is missing or not boolean', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: 'yes' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown map', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/map/unknown-map/areas/area-2')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(404);
  });

  test('returns 404 for unknown area', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/unknown-area')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(404);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .patch('/campaign/map/map-1/areas/area-2')
      .send({ revealed: true });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Issue #7 – GET /campaign/encounters/:id with mobs and initiative
// ---------------------------------------------------------------------------
describe('GET /campaign/encounters/:id – mobs and initiative', () => {
  test('DM receives full encounter including mobs with dmNotes', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mobs)).toBe(true);
    expect(res.body.mobs[0].dmNotes).toBeDefined();
    expect(Array.isArray(res.body.initiativeOrder)).toBe(true);
    expect(res.body.round).toBeDefined();
    expect(res.body.activeParticipantId).toBeDefined();
  });

  test('PLAYER sees mobs and initiative but not per-mob dmNotes', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mobs)).toBe(true);
    expect(res.body.mobs.every((m: { dmNotes?: string }) => m.dmNotes === undefined)).toBe(true);
    expect(Array.isArray(res.body.initiativeOrder)).toBe(true);
    expect(res.body.dmNotes).toBeUndefined();
    expect(res.body.hiddenDetails).toBeUndefined();
  });

  test('TABLE sees mobs and initiative but not per-mob dmNotes', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.mobs.every((m: { dmNotes?: string }) => m.dmNotes === undefined)).toBe(true);
    expect(res.body.dmNotes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Issue #7 – PATCH /campaign/encounters/:id (DM updates combat state)
// ---------------------------------------------------------------------------
describe('PATCH /campaign/encounters/:encounterId', () => {
  test('DM can update initiative order and round', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        round: 2,
        activeParticipantId: 'player-1',
        initiativeOrder: [
          { participantId: 'player-1', name: 'Elara', initiative: 18, isPlayer: true },
          { participantId: 'mob-1', name: 'Goblin Leader', initiative: 10, isPlayer: false },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.round).toBe(2);
    expect(res.body.activeParticipantId).toBe('player-1');
    expect(res.body.initiativeOrder).toHaveLength(2);
    expect(res.body.initiativeOrder[0].name).toBe('Elara');
  });

  test('DM can update mob hp and status effects', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mobs: [
          {
            id: 'mob-1',
            name: 'Goblin Leader',
            hp: 3,
            maxHp: 15,
            statusEffects: [{ name: 'Poisoned', duration: 1 }],
            dmNotes: 'About to surrender',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.mobs[0].hp).toBe(3);
    expect(res.body.mobs[0].statusEffects[0].name).toBe('Poisoned');
  });

  test('PLAYER cannot update an encounter (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .patch('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ round: 3 });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot update an encounter (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .patch('/campaign/encounters/enc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ round: 3 });
    expect(res.status).toBe(403);
  });

  test('returns 404 for unknown encounter', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/encounters/unknown-enc')
      .set('Authorization', `Bearer ${token}`)
      .send({ round: 1 });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Issue #8 – PATCH /campaign/npcs/:npcId (DM reveals NPC)
// ---------------------------------------------------------------------------
describe('PATCH /campaign/npcs/:npcId', () => {
  test('DM can reveal an NPC', async () => {
    const token = makeToken(ROLES.DM);
    // npc-1 is already revealed; hide it first then reveal
    await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: false });

    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(200);
    expect(res.body.revealed).toBe(true);
  });

  test('DM can update public description', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ publicDescription: 'A suspicious merchant with a hidden agenda.' });
    expect(res.status).toBe(200);
    expect(res.body.publicDescription).toBe('A suspicious merchant with a hidden agenda.');
  });

  test('revealed change is visible to PLAYER via GET', async () => {
    const dmToken = makeToken(ROLES.DM, 'dm-1');
    const playerToken = makeToken(ROLES.PLAYER, 'player-1');

    // Hide npc-1
    await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ revealed: false });

    // Player cannot see the hidden NPC
    const hidden = await request(app)
      .get('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(hidden.status).toBe(404);

    // DM reveals it
    await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ revealed: true });

    // Player can now see it
    const visible = await request(app)
      .get('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(visible.status).toBe(200);
    expect(visible.body.name).toBe('Zara the Merchant');
    expect(visible.body.hiddenMotivation).toBeUndefined();
  });

  test('PLAYER cannot reveal an NPC (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot reveal an NPC (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(403);
  });

  test('returns 404 for unknown NPC', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/npcs/unknown-npc')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: true });
    expect(res.status).toBe(404);
  });

  test('returns 400 when revealed is not a boolean', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ revealed: 'true' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when publicDescription is not a string', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .patch('/campaign/npcs/npc-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ publicDescription: { nested: 'object' } });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Issue #9 – GET /campaign/view/table (kiosk display mode)
// ---------------------------------------------------------------------------
describe('GET /campaign/view/table', () => {
  test('TABLE role receives aggregated public view', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.map).toBeDefined();
    expect(res.body.encounter).toBeDefined();
    expect(Array.isArray(res.body.npcs)).toBe(true);
  });

  test('TABLE view does not include DM-private map fields', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.map.dmOverlay).toBeUndefined();
    expect(res.body.map.hiddenAreas).toBeUndefined();
    expect(res.body.map.areas.every((a: { revealed: boolean }) => a.revealed)).toBe(true);
  });

  test('TABLE view does not include DM encounter notes', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.encounter.dmNotes).toBeUndefined();
    expect(res.body.encounter.hiddenDetails).toBeUndefined();
    expect(res.body.encounter.mobs.every((m: { dmNotes?: string }) => m.dmNotes === undefined)).toBe(true);
  });

  test('TABLE view NPC list contains only revealed NPCs without hidden fields', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const npc = res.body.npcs[0];
    expect(npc).toBeDefined();
    expect(npc.hiddenMotivation).toBeUndefined();
    expect(npc.hiddenHp).toBeUndefined();
    expect(npc.dmNotes).toBeUndefined();
  });

  test('PLAYER receives same aggregated public view', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.map).toBeDefined();
    expect(res.body.encounter).toBeDefined();
    expect(Array.isArray(res.body.npcs)).toBe(true);
  });

  test('DM receives full aggregated view including DM-private fields', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/view/table')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.map.dmOverlay).toBeDefined();
    expect(res.body.map.hiddenAreas).toBeDefined();
    expect(res.body.encounter.dmNotes).toBeDefined();
    expect(res.body.npcs[0].hiddenMotivation).toBeDefined();
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/view/table');
    expect(res.status).toBe(401);
  });
});
