/**
 * Session join flow with role-scoped JWT tokens.
 *
 * Tokens carry:
 *   sub   – identity of the bearer (userId or a well-known label)
 *   role  – one of ROLES.DM | ROLES.PLAYER | ROLES.TABLE
 *   sid   – campaign session ID
 *   iat / exp – issued-at / expiry
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { ROLES } from './roles';
import { IssueTokenParams, TokenPayload, AuthenticatedRequest } from './types';

const JWT_SECRET: string = process.env.JWT_SECRET ?? 'dnd-campaign-table-dev-secret';
const TOKEN_TTL: string = process.env.TOKEN_TTL ?? '8h';

/**
 * Issue a role-scoped session token.
 *
 * @param params - userId, role, sessionId
 * @returns signed JWT string
 * @throws Error if role is not one of the recognised ROLES values
 */
export function issueToken({ userId, role, sessionId }: IssueTokenParams): string {
  if (!(Object.values(ROLES) as string[]).includes(role)) {
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
    { expiresIn: TOKEN_TTL } as jwt.SignOptions,
  );
}

/**
 * Verify a token and return the decoded payload.
 *
 * @param token - JWT string
 * @returns decoded TokenPayload
 * @throws Error on invalid / expired tokens
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Express middleware: extract + validate the Bearer token from the
 * Authorization header and attach the decoded payload as `req.session`.
 *
 * Responds 401 when no / invalid token is provided.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    (req as AuthenticatedRequest).session = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
