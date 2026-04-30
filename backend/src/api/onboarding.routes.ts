import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.middleware.js';
import { registerTenant } from '../services/onboarding.service.js';
import { sendCreated } from '../utils/response.js';

const router = Router();

const registerTenantSchema = z.object({
  tenant_name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  admin_name: z.string().min(2),
  admin_email: z.string().email(),
  admin_password: z.string().min(8)
});

// ─── POST /api/onboarding/register ───────────────────────────────────────────

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerTenantSchema.parse(req.body);

    const result = await registerTenant(
      body.tenant_name,
      body.slug,
      body.admin_name,
      body.admin_email,
      body.admin_password
    );

    sendCreated(res, {
      message: 'Tenant and Admin user created successfully. You can now login.',
      ...result
    });
  }),
);

export default router;
