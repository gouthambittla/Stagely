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

  describe('payments', () => {
    const prod = { ...base, NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'p' };
    const razorpay = {
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
      PUBLIC_BASE_URL: 'https://api.stagely.in'
    };

    it('requires Razorpay keys and a public URL when payments are on in production', () => {
      expect(() => loadEnv({ ...prod, PAYMENTS_ENABLED: 'true' })).toThrow(
        /RAZORPAY_KEY_ID[\s\S]*RAZORPAY_KEY_SECRET[\s\S]*RAZORPAY_WEBHOOK_SECRET[\s\S]*PUBLIC_BASE_URL/
      );
    });

    it('accepts a complete production payments config', () => {
      expect(loadEnv({ ...prod, PAYMENTS_ENABLED: 'true', ...razorpay }).PAYMENTS_ENABLED).toBe('true');
    });

    it('does not need Razorpay keys while payments are off', () => {
      expect(() => loadEnv({ ...prod })).not.toThrow();
    });

    it('rejects a platform fee outside 0–99%', () => {
      expect(() => loadEnv({ ...base, PLATFORM_FEE_PERCENT: '100' })).toThrow(/PLATFORM_FEE_PERCENT/);
      expect(() => loadEnv({ ...base, PLATFORM_FEE_PERCENT: '-1' })).toThrow(/PLATFORM_FEE_PERCENT/);
    });

    it('rejects a zero payment window', () => {
      expect(() => loadEnv({ ...base, PAYMENT_WINDOW_HOURS: '0' })).toThrow(/PAYMENT_WINDOW_HOURS/);
    });
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
