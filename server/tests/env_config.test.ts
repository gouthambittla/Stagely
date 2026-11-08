import { loadEnv } from '../src/config/env';

describe('Startup environment validation', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/stagely' };

  it('accepts a minimal development config and applies defaults', () => {
    const env = loadEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5000);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('refuses mock auth in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', ALLOW_MOCK_AUTH: 'true', FIREBASE_PROJECT_ID: 'p' })
    ).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it('requires Firebase credentials in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/FIREBASE/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('never echoes secret values in the error', () => {
    try {
      loadEnv({ DATABASE_URL: 'mysql://secretuser:secretpass@db/x' });
      throw new Error('expected failure');
    } catch (err: any) {
      expect(err.message).not.toContain('secretpass');
    }
  });
});
