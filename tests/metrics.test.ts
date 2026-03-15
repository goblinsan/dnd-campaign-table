/**
 * Integration tests for the Performance Metrics endpoints.
 *
 * Covers Issue #18 – latency/fps monitoring for map and table display clients:
 *   POST /campaign/metrics           – submit a performance metric report
 *   GET  /campaign/metrics           – retrieve performance summary (DM only)
 *   GET  /campaign/metrics/raw       – retrieve raw reports (DM only)
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
// POST /campaign/metrics
// ---------------------------------------------------------------------------

describe('POST /campaign/metrics', () => {
  test('TABLE client can report latency and FPS', async () => {
    const token = makeToken(ROLES.TABLE, 'table-client', 'sess-1');
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'table', latencyMs: 45, fps: 60 });
    expect(res.status).toBe(201);
    expect(res.body.clientType).toBe('table');
    expect(res.body.latencyMs).toBe(45);
    expect(res.body.fps).toBe(60);
    expect(res.body.userId).toBe('table-client');
    expect(res.body.sessionId).toBe('sess-1');
    expect(typeof res.body.reportedAt).toBe('number');
    expect(typeof res.body.id).toBe('string');
  });

  test('map client can report only latency', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'map', latencyMs: 120 });
    expect(res.status).toBe(201);
    expect(res.body.latencyMs).toBe(120);
    expect(res.body.fps).toBeUndefined();
  });

  test('player client can report only FPS', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'player', fps: 30 });
    expect(res.status).toBe(201);
    expect(res.body.fps).toBe(30);
    expect(res.body.latencyMs).toBeUndefined();
  });

  test('DM client can report metrics', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'dm', latencyMs: 10, fps: 60 });
    expect(res.status).toBe(201);
  });

  test('returns 400 for invalid clientType', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'kiosk', latencyMs: 50 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when neither latencyMs nor fps is provided', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'player' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when latencyMs is negative', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'player', latencyMs: -5 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when fps is negative', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientType: 'player', fps: -1 });
    expect(res.status).toBe(400);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app)
      .post('/campaign/metrics')
      .send({ clientType: 'table', latencyMs: 50 });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/metrics – performance summary
// ---------------------------------------------------------------------------

describe('GET /campaign/metrics', () => {
  test('initial summary shows all zeros', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalReports).toBe(0);
    expect(res.body.averageLatencyMs).toBe(0);
    expect(res.body.averageFps).toBe(0);
    expect(typeof res.body.clientBreakdown).toBe('object');
    expect(res.body.lastReportAt).toBeUndefined();
  });

  test('summary aggregates submitted reports', async () => {
    const tableToken = makeToken(ROLES.TABLE, 't1', 'sess-1');
    const playerToken = makeToken(ROLES.PLAYER, 'p1', 'sess-1');
    const dmToken = makeToken(ROLES.DM);

    await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${tableToken}`)
      .send({ clientType: 'table', latencyMs: 40, fps: 60 });
    await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${tableToken}`)
      .send({ clientType: 'table', latencyMs: 60, fps: 58 });
    await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ clientType: 'player', latencyMs: 100 });

    const res = await request(app)
      .get('/campaign/metrics')
      .set('Authorization', `Bearer ${dmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalReports).toBe(3);
    // average latency: (40 + 60 + 100) / 3 = 66.67 → 67
    expect(res.body.averageLatencyMs).toBe(67);
    // average fps: (60 + 58) / 2 = 59
    expect(res.body.averageFps).toBe(59);
    expect(res.body.lastReportAt).toBeDefined();
    expect(res.body.clientBreakdown.table).toBeDefined();
    expect(res.body.clientBreakdown.table.count).toBe(2);
    expect(res.body.clientBreakdown.player).toBeDefined();
    expect(res.body.clientBreakdown.player.count).toBe(1);
  });

  test('PLAYER cannot view the performance summary (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('TABLE cannot view the performance summary (403)', async () => {
    const token = makeToken(ROLES.TABLE);
    const res = await request(app)
      .get('/campaign/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/metrics');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /campaign/metrics/raw
// ---------------------------------------------------------------------------

describe('GET /campaign/metrics/raw', () => {
  test('DM can retrieve raw metric reports (empty initially)', async () => {
    const token = makeToken(ROLES.DM);
    const res = await request(app)
      .get('/campaign/metrics/raw')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.metrics)).toBe(true);
    expect(res.body.metrics).toHaveLength(0);
  });

  test('raw reports include individual records after submission', async () => {
    const tableToken = makeToken(ROLES.TABLE);
    const dmToken = makeToken(ROLES.DM);

    await request(app)
      .post('/campaign/metrics')
      .set('Authorization', `Bearer ${tableToken}`)
      .send({ clientType: 'table', latencyMs: 50, fps: 55 });

    const res = await request(app)
      .get('/campaign/metrics/raw')
      .set('Authorization', `Bearer ${dmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toHaveLength(1);
    expect(res.body.metrics[0].clientType).toBe('table');
    expect(res.body.metrics[0].latencyMs).toBe(50);
  });

  test('PLAYER cannot view raw metrics (403)', async () => {
    const token = makeToken(ROLES.PLAYER);
    const res = await request(app)
      .get('/campaign/metrics/raw')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/campaign/metrics/raw');
    expect(res.status).toBe(401);
  });
});
