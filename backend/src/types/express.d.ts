import type { JwtPayload } from '@swims/shared';

// Augment Express Request with auth context
declare global {
  namespace Express {
    interface Request {
      userId: string;
      tenantId: string;
      userRole: string;
      jwtPayload: JwtPayload;
    }
  }
}

export {};
