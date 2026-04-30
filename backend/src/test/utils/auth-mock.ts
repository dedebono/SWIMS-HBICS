import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export function generateTestToken(
  tenant_id: string = '123e4567-e89b-12d3-a456-426614174000',
  user_id: string = '123e4567-e89b-12d3-a456-426614174001',
  role: string = 'IT_ADMIN'
): string {
  // Use the secret from env or a fallback if tests don't load .env
  const secret = env.JWT_SECRET || 'test_secret_key';
  
  return jwt.sign(
    { 
      user_id, 
      tenant_id, 
      role 
    },
    secret,
    { expiresIn: '15m' }
  );
}
