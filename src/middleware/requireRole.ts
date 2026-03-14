/**
 * Role-enforcement middleware factory.
 *
 * Usage:
 *   router.get('/admin', authenticate, requirePermission('session:manage'), handler)
 *   router.get('/join',  authenticate, requireRole(ROLES.DM, ROLES.PLAYER), handler)
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { hasPermission } from '../roles';
import { AuthenticatedRequest, Permission, Role } from '../types';

/**
 * Middleware that allows only requests whose session role holds the given
 * capability.  Must be placed after the `authenticate` middleware so that
 * `req.session` is already populated.
 *
 * Responds 403 when the role lacks the permission.
 *
 * @param permission – capability string from the capability matrix
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as AuthenticatedRequest).session?.role;
    if (!hasPermission(role, permission)) {
      res.status(403).json({
        error: `Role '${role}' does not have permission '${permission}'`,
      });
      return;
    }
    next();
  };
}

/**
 * Middleware that allows only requests whose session role is one of the
 * provided allowed roles.  Must be placed after `authenticate`.
 *
 * Responds 403 when the role is not in the allowed list.
 *
 * @param allowedRoles – values from ROLES.*
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  const allowed = new Set<string>(allowedRoles.map((r) => r.toLowerCase()));
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as AuthenticatedRequest).session?.role;
    if (!allowed.has(role)) {
      res.status(403).json({
        error: `Role '${role}' is not allowed to access this resource`,
      });
      return;
    }
    next();
  };
}
