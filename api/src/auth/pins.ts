import bcryptjs from 'bcryptjs';

// bcryptjs is a CJS module. Under Node's ESM loader with namespace imports
// the named exports are flaky; default-import and destructure works reliably.
const { hash, compare } = bcryptjs as unknown as {
  hash:    (pin: string, rounds: number) => Promise<string>;
  compare: (pin: string, hash: string)   => Promise<boolean>;
};

const BCRYPT_HASH_LEN = 60;
const ROUNDS = 10;

export function generatePin(): string {
  const n = Math.floor(Math.random() * 1e8);
  return n.toString().padStart(8, '0');
}

export async function hashPin(pin: string): Promise<string> {
  return hash(pin, ROUNDS);
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.length === BCRYPT_HASH_LEN && stored.startsWith('$2')) {
    try {
      return await compare(pin, stored);
    } catch {
      return false;
    }
  }
  return pin === stored;
}

export function isLegacyPin(stored: string): boolean {
  return !(stored.length === BCRYPT_HASH_LEN && stored.startsWith('$2'));
}
