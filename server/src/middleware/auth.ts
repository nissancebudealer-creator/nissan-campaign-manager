import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";
import { roleHasPermission } from "../services/permission.service.js";
import type { RoleName } from "../config/roles.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}

// Checked live against the database on every request (see permission.service.ts) — a role's
// permissions are Administrator-editable from the Roles tab, so a change takes effect on the very
// next request, not just the next login.
export function requirePermission(key: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "Authentication required"));
      return;
    }
    try {
      const allowed = await roleHasPermission(req.user.role as RoleName, key);
      if (!allowed) {
        next(new AppError(403, "You do not have permission to perform this action"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
