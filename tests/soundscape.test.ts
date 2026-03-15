/**
 * Integration tests for the Soundscape endpoints.
 *
 * Covers Issue #16 – ambient music + SFX queues by location/encounter:
 *   PUT    /campaign/soundscape/:sceneId        – create/replace an audio scene
 *   GET    /campaign/soundscape/:sceneId        – read a single scene (DM)
 *   GET    /campaign/soundscape                 – list all scenes (DM)
 *   POST   /campaign/soundscape/:sceneId/activate – activate a scene
 *   GET    /campaign/soundscape/active          – get the currently active scene
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

const validScene = {
  name: 'Dungeon Ambience',
  type: 'ambient',
  tracks: [{ id: 'track-1', url: 'https://cdn.example.com/dungeon.mp3', loop: true }],
  transitionMs: 2000,
};

// ---------------------------------------------------------------------------
// PUT /campaign/soundscape/:sceneId
// ---------------------------------------------------------------------------

describe('PUT /campaign/soundscape/:sceneId', () => {
  test('DM can create an audio scene', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send(validScene);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('scene-1');
    expect(res.body.name).toBe('Dungeon Ambience');
    expect(res.body.type).toBe('ambient');
    expect(res.body.tracks).toHaveLength(1);
    expect(res.body.transitionMs).toBe(2000);
  });

  test('DM can replace an existing audio scene', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send(validScene);

    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, name: 'Updated Ambience' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Ambience');
  });

  test('scene can be associated with a location', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-loc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, associatedLocationId: 'map-1' });
    expect(res.status).toBe(200);
    expect(res.body.associatedLocationId).toBe('map-1');
  });

  test('scene can be associated with an encounter', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-enc')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, associatedEncounterId: 'enc-1' });
    expect(res.status).toBe(200);
    expect(res.body.associatedEncounterId).toBe('enc-1');
  });

  test('returns 400 when name is missing', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'ambient', tracks: [] });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid scene type', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, type: 'unknown' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when tracks is not an array', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, tracks: 'not-array' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when transitionMs is negative', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, transitionMs: -1 });
    expect(res.status).toBe(400);
  });

  test('PLAYER cannot create a scene (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send(validScene);
    expect(res.status).toBe(403);
  });

  test('TABLE cannot create a scene (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`)
      .send(validScene);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .put('/campaign/soundscape/scene-1')
      .send(validScene);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/soundscape/:sceneId
// ---------------------------------------------------------------------------

describe('GET /campaign/soundscape/:sceneId', () => {
  test('DM can read a scene that exists', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/soundscape/scene-2')
      .set('Authorization', `Bearer ${token}`)
      .send(validScene);

    const res = await request(app)
      .get('/campaign/soundscape/scene-2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('scene-2');
  });

  test('returns 404 for unknown scene', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/soundscape/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('PLAYER cannot read individual scenes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/soundscape/scene-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/soundscape/scene-1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/soundscape – list all scenes
// ---------------------------------------------------------------------------

describe('GET /campaign/soundscape', () => {
  test('DM can list all scenes (empty initially)', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/soundscape')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.scenes)).toBe(true);
    expect(res.body.scenes).toHaveLength(0);
  });

  test('lists scenes after creation', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/soundscape/scene-a')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, name: 'Scene A' });
    await request(app)
      .put('/campaign/soundscape/scene-b')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, name: 'Scene B', type: 'encounter' });

    const res = await request(app)
      .get('/campaign/soundscape')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.scenes).toHaveLength(2);
  });

  test('PLAYER cannot list scenes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/soundscape')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /campaign/soundscape/:sceneId/activate
// ---------------------------------------------------------------------------

describe('POST /campaign/soundscape/:sceneId/activate', () => {
  test('DM can activate an existing scene', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .put('/campaign/soundscape/scene-combat')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validScene, type: 'encounter', name: 'Combat Theme' });

    const res = await request(app)
      .post('/campaign/soundscape/scene-combat/activate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.scene.id).toBe('scene-combat');
    expect(res.body.message).toContain('activated');
  });

  test('returns 404 when scene does not exist', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/soundscape/missing-scene/activate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('PLAYER cannot activate scenes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/soundscape/scene-1/activate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).post('/campaign/soundscape/scene-1/activate');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/soundscape/active
// ---------------------------------------------------------------------------

describe('GET /campaign/soundscape/active', () => {
  test('returns null when no scene is active', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/soundscape/active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.active).toBeNull();
  });

  test('returns the active scene after DM activates one', async () => {
    const dmToken = makeToken(ROLES.DM, 'dm-1');
    const playerToken = makeToken(ROLES.PLAYER, 'player-1');

    await request(app)
      .put('/campaign/soundscape/scene-forest')
      .set('Authorization', `Bearer ${dmToken}`)
      .send({ ...validScene, name: 'Forest Ambience', associatedLocationId: 'map-2' });

    await request(app)
      .post('/campaign/soundscape/scene-forest/activate')
      .set('Authorization', `Bearer ${dmToken}`);

    const res = await request(app)
      .get('/campaign/soundscape/active')
      .set('Authorization', `Bearer ${playerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.active).toBeDefined();
    expect(res.body.active.id).toBe('scene-forest');
    expect(res.body.active.name).toBe('Forest Ambience');
  });

  test('TABLE role can read the active scene', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/soundscape/active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/soundscape/active');
    expect(res.status).toBe(401);
  });
});
