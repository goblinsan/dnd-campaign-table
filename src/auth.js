/**
 * Session join flow with role-scoped JWT tokens.
 *
 * Tokens carry:
 *   sub   – identity of the bearer (userId or a well-known label)
 *   role  – one of ROLES.DM | ROLES.PLAYER | ROLES.TABLE
 *   sid   – campaign session ID
 *   iat / exp – issued-at / expiry
 */

const jwt = require('jsonwebtoken');
const { ROLES } = require('./roles');

const JWT_SECRET = process.env.JWT_SECRET || 'dnd-campaign-table-dev-secret';
const TOKEN_TTL = process.env.TOKEN_TTL || '8h';

/**
 * Issue a role-scoped session token.
 *
 * @param {{ userId: string, role: string, sessionId: string }} payload
 * @returns {string} signed JWT
 * @throws {Error} if role is not one of the recognised ROLES values
 */
function issueToken({ userId, role, sessionId }) {
  if (!Object.values(ROLES).includes(role)) {
    throw new Error(`Unknown role: ${role}`);
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId must be a non-empty string');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId must be a non-empty string');
  }

  return jwt.sign(
    { sub: userId, role, sid: sessionId },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * Verify a token and return the decoded payload.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, sid: string, iat: number, exp: number }}
 * @throws {Error} on invalid / expired tokens
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Express middleware: extract + validate the Bearer token from the
 * Authorization header and attach the decoded payload as `req.session`.
 *
 * Responds 401 when no / invalid token is provided.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    req.session = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { issueToken, verifyToken, authenticate };
