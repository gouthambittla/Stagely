import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgres:// connection string'),
    FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
    FIREBASE_PROJECT_ID: z.string().optional(),
    ALLOW_MOCK_AUTH: z.enum(['true', 'false']).optional(),
    CORS_ORIGINS: z.string().optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).optional()
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.ALLOW_MOCK_AUTH === 'true') {
        ctx.addIssue({ code: 'custom', path: ['ALLOW_MOCK_AUTH'], message: 'must not be enabled in production' });
      }
      if (!env.FIREBASE_SERVICE_ACCOUNT && !env.FIREBASE_PROJECT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['FIREBASE_SERVICE_ACCOUNT'],
          message: 'FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID is required in production'
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Validates process.env at startup; throws with every problem listed (values are never printed). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
