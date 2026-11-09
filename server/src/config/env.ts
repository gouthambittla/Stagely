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
    TRUST_PROXY: z.coerce.number().int().min(0).optional(),

    // Payments (Razorpay Route). See src/config/payments.ts for defaults.
    PAYMENTS_ENABLED: z.enum(['true', 'false']).optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(99).optional(),
    PAYMENT_WINDOW_HOURS: z.coerce.number().positive().optional(),
    DISPUTE_WINDOW_HOURS: z.coerce.number().positive().optional(),
    PUBLIC_BASE_URL: z.string().url().optional()
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
      if (env.PAYMENTS_ENABLED === 'true') {
        for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'PUBLIC_BASE_URL'] as const) {
          if (!env[key]) {
            ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production when PAYMENTS_ENABLED=true' });
          }
        }
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
