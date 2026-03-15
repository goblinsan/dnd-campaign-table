/**
 * Integration tests for the Feedback endpoints.
 *
 * Covers Issue #17 – player feedback prompts and post-session notes capture:
 *   POST /campaign/feedback          – submit player feedback
 *   GET  /campaign/feedback          – list all feedback (DM only)
 *   POST /campaign/feedback/notes    – add a post-session note (DM only)
 *   GET  /campaign/feedback/notes    – list session notes (DM only)
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
// POST /campaign/feedback
// ---------------------------------------------------------------------------

describe('POST /campaign/feedback', () => {
  test('PLAYER can submit feedback with all optional fields', async () => {
    const token = makeToken(ROLES.PLAYER, 'player-1', 'sess-x');
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ clarity: 4, immersion: 5, notes: 'Great session!' });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe('player-1');
    expect(res.body.sessionId).toBe('sess-x');
    expect(res.body.clarity).toBe(4);
    expect(res.body.immersion).toBe(5);
    expect(res.body.notes).toBe('Great session!');
    expect(typeof res.body.submittedAt).toBe('number');
    expect(typeof res.body.id).toBe('string');
  });

  test('PLAYER can submit feedback with only some fields', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ clarity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.clarity).toBe(3);
    expect(res.body.immersion).toBeUndefined();
    expect(res.body.notes).toBeUndefined();
  });

  test('DM can also submit feedback', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'DM perspective notes' });
    expect(res.status).toBe(201);
  });

  test('TABLE can submit feedback', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ immersion: 4 });
    expect(res.status).toBe(201);
  });

  test('returns 400 when clarity is out of range', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ clarity: 6 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when immersion is out of range', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ immersion: 0 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when notes is not a string', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: { nested: 'object' } });
    expect(res.status).toBe(400);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .post('/campaign/feedback')
      .send({ clarity: 3 });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/feedback
// ---------------------------------------------------------------------------

describe('GET /campaign/feedback', () => {
  test('DM can list all feedback (empty initially)', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.feedback)).toBe(true);
    expect(res.body.feedback).toHaveLength(0);
  });

  test('DM sees submitted feedback', async () => {
    const playerToken = makeToken(ROLES.PLAYER, 'player-2', 'sess-1');
    const dmToken = makeToken(ROLES.DM, 'dm-1', 'sess-1');

    await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ clarity: 4, immersion: 5 });

    const res = await request(app)
      .get('/campaign/feedback')
      .set('Authorization', `Bearer ${dmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toHaveLength(1);
    expect(res.body.feedback[0].clarity).toBe(4);
  });

  test('DM can filter feedback by sessionId', async () => {
    const token1 = makeToken(ROLES.PLAYER, 'p-1', 'sess-A');
    const token2 = makeToken(ROLES.PLAYER, 'p-2', 'sess-B');
    const dmToken = makeToken(ROLES.DM);

    await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token1}`)
      .send({ clarity: 3 });
    await request(app)
      .post('/campaign/feedback')
      .set('Authorization', `Bearer ${token2}`)
      .send({ clarity: 5 });

    const res = await request(app)
      .get('/campaign/feedback?sessionId=sess-A')
      .set('Authorization', `Bearer ${dmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toHaveLength(1);
    expect(res.body.feedback[0].sessionId).toBe('sess-A');
  });

  test('PLAYER cannot list feedback (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE cannot list feedback (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/feedback')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/feedback');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /campaign/feedback/notes
// ---------------------------------------------------------------------------

describe('POST /campaign/feedback/notes', () => {
  test('DM can add a session note', async () => {
    const token = makeToken(ROLES.DM, 'dm-1', 'sess-z');
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Players enjoyed the goblin encounter' });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Players enjoyed the goblin encounter');
    expect(res.body.sessionId).toBe('sess-z');
    expect(res.body.createdBy).toBe('dm-1');
    expect(typeof res.body.createdAt).toBe('number');
    expect(typeof res.body.id).toBe('string');
  });

  test('DM can specify an explicit sessionId in the note', async () => {
    const token = makeToken(ROLES.DM, 'dm-1', 'current-session');
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Retrospective note', sessionId: 'past-session' });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe('past-session');
  });

  test('returns 400 when content is missing', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('PLAYER cannot add session notes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Player note' });
    expect(res.status).toBe(403);
  });

  test('TABLE cannot add session notes (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Table note' });
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .post('/campaign/feedback/notes')
      .send({ content: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/feedback/notes
// ---------------------------------------------------------------------------

describe('GET /campaign/feedback/notes', () => {
  test('DM can list all notes (empty initially)', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notes)).toBe(true);
    expect(res.body.notes).toHaveLength(0);
  });

  test('DM sees notes after creation', async () => {
    const token = makeToken(ROLES.DM);
    await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Session wrap-up note' });

    const res = await request(app)
      .get('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].content).toBe('Session wrap-up note');
  });

  test('DM can filter notes by sessionId', async () => {
    const tokenA = makeToken(ROLES.DM, 'dm-1', 'sess-A');
    const tokenB = makeToken(ROLES.DM, 'dm-1', 'sess-B');
    const dmToken = makeToken(ROLES.DM);

    await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Note for session A' });
    await request(app)
      .post('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'Note for session B' });

    const res = await request(app)
      .get('/campaign/feedback/notes?sessionId=sess-A')
      .set('Authorization', `Bearer ${dmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].content).toBe('Note for session A');
  });

  test('PLAYER cannot list notes (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE cannot list notes (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/feedback/notes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/feedback/notes');
    expect(res.status).toBe(401);
  });
});
