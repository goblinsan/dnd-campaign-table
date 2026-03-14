/**
 * Role-enforcement middleware factory.
 *
 * Usage:
 *   router.get('/admin', authenticate, requirePermission('session:manage'), handler)
 *   router.get('/join',  authenticate, requireRole(ROLES.DM, ROLES.PLAYER), handler)
 */

const { hasPermission, ROLES } = require('../roles');

/**
 * Middleware that allows only requests whose session role holds the given
 * capability.  Must be placed after the `authenticate` middleware so that
 * `req.session` is already populated.
 *
 * Responds 403 when the role lacks the permission.
 *
 * @param {string} permission – capability string from the capability matrix
 * @returns {import('express').RequestHandler}
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session && req.session.role;
    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        error: `Role '${role}' does not have permission '${permission}'`,
      });
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
 * @param {...string} allowedRoles – values from ROLES.*
 * @returns {import('express').RequestHandler}
 */
function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((r) => r.toLowerCase()));
  return (req, res, next) => {
    const role = req.session && req.session.role;
    if (!allowed.has(role)) {
      return res.status(403).json({
        error: `Role '${role}' is not allowed to access this resource`,
      });
    }
    next();
  };
}

module.exports = { requirePermission, requireRole };
