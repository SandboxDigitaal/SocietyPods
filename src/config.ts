import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Vercel functions can write only to /tmp. This is intentionally ephemeral demo data.
  databasePath: process.env.DATABASE_PATH ?? (process.env.VERCEL ? '/tmp/society-pods.db' : './data/society-pods.db'),
  jwtSecret: process.env.JWT_SECRET ?? 'society-pods-local-demo-secret'
};

export const SEED_PARENT_ID = 'resident-seed-parent-001';
export const TRUSTED_EMAIL_DOMAINS = ['@google.com', '@microsoft.com', '@tcs.com'];
