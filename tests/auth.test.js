/**
 * Tests for session token issuance and validation (Issue #2).
 */

const { issueToken, verifyToken } = require('../src/auth');
const { ROLES } = require('../src/roles');

const VALID_PAYLOAD = { userId: 'user-1', role: ROLES.DM, sessionId: 'session-abc' };

describe('issueToken()', () => {
  test('returns a JWT string for valid inputs', () => {
    const token = issueToken(VALID_PAYLOAD);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  test('token payload contains sub, role, and sid claims', () => {
    const token = issueToken(VALID_PAYLOAD);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(VALID_PAYLOAD.userId);
    expect(decoded.role).toBe(VALID_PAYLOAD.role);
    expect(decoded.sid).toBe(VALID_PAYLOAD.sessionId);
  });

  test('issues tokens for all valid roles', () => {
    for (const role of Object.values(ROLES)) {
      const token = issueToken({ userId: 'u', role, sessionId: 's' });
      const decoded = verifyToken(token);
      expect(decoded.role).toBe(role);
    }
  });

  test('throws for an unknown role', () => {
    expect(() => issueToken({ userId: 'u', role: 'superadmin', sessionId: 's' }))
      .toThrow('Unknown role');
  });

  test('throws when userId is missing', () => {
    expect(() => issueToken({ userId: '', role: ROLES.DM, sessionId: 's' }))
      .toThrow('userId');
  });

  test('throws when sessionId is missing', () => {
    expect(() => issueToken({ userId: 'u', role: ROLES.DM, sessionId: '' }))
      .toThrow('sessionId');
  });
});

describe('verifyToken()', () => {
  test('returns the decoded payload for a valid token', () => {
    const token = issueToken(VALID_PAYLOAD);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(VALID_PAYLOAD.userId);
  });

  test('throws for a tampered token', () => {
    const token = issueToken(VALID_PAYLOAD);
    const [h, p, sig] = token.split('.');
    expect(() => verifyToken(`${h}.${p}.invalidsignature`)).toThrow();
  });

  test('throws for a completely invalid string', () => {
    expect(() => verifyToken('not.a.token')).toThrow();
  });
});
