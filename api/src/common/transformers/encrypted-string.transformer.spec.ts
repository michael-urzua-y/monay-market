import { encryptedStringTransformer } from './encrypted-string.transformer';

describe('encryptedStringTransformer', () => {
  const originalKey = process.env.APP_DATA_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.APP_DATA_ENCRYPTION_KEY;
    } else {
      process.env.APP_DATA_ENCRYPTION_KEY = originalKey;
    }
  });

  it('returns plaintext when no encryption key is configured', () => {
    delete process.env.APP_DATA_ENCRYPTION_KEY;

    const stored = encryptedStringTransformer.to('plain-secret');
    const restored = encryptedStringTransformer.from(stored);

    expect(stored).toBe('plain-secret');
    expect(restored).toBe('plain-secret');
  });

  it('encrypts and decrypts values when an encryption key is configured', () => {
    process.env.APP_DATA_ENCRYPTION_KEY = 'monay-market-encryption-key-32-plus';

    const stored = encryptedStringTransformer.to('plain-secret');
    const restored = encryptedStringTransformer.from(stored);

    expect(stored).not.toBe('plain-secret');
    expect(stored).toMatch(/^enc:v1:/);
    expect(restored).toBe('plain-secret');
  });

  it('keeps legacy plaintext values readable even after enabling encryption', () => {
    process.env.APP_DATA_ENCRYPTION_KEY = 'monay-market-encryption-key-32-plus';

    const restored = encryptedStringTransformer.from('legacy-plain-secret');

    expect(restored).toBe('legacy-plain-secret');
  });
});
