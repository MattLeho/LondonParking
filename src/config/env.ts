import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : undefined;
loadEnv({ path: envFile });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    DATABASE_URL: z.url().optional(),
    AUTH_JWKS_URL: z.url().optional(),
    AUTH_AUDIENCE: z.string().optional(),
    AUTH_ISSUER: z.url().optional(),
    ADMIN_ROLE: z.string().default('admin'),
    GUEST_ROLE: z.string().default('guest'),
    LEADERBOARD_DAILY_SECRET: z.string().min(16).default('local-daily-secret'),
    REDIS_URL: z.url().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    SENTRY_DSN: z.url().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.NODE_ENV === 'production') {
      const authKeys = [values.AUTH_JWKS_URL, values.AUTH_AUDIENCE, values.AUTH_ISSUER];
      const configured = authKeys.every((value) => typeof value === 'string' && value.length > 0);

      if (!configured) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Auth configuration incomplete. Provide AUTH_JWKS_URL, AUTH_AUDIENCE, and AUTH_ISSUER in production environments.',
          path: ['AUTH_JWKS_URL'],
        });
      }

      if (!values.DATABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          message: 'DATABASE_URL must be provided in production.',
          path: ['DATABASE_URL'],
        });
      }

      if (!values.REDIS_URL) {
        ctx.addIssue({
          code: 'custom',
          message: 'REDIS_URL must be provided in production.',
          path: ['REDIS_URL'],
        });
      }
    }
  });

type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues;
  throw new Error(`Invalid environment variables: ${JSON.stringify(issues, null, 2)}`);
}

export const env: Env = parsed.data;
