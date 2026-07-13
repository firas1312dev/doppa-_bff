import * as bcrypt from 'bcrypt';

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * Laravel (Doppa) stores hashes with the `$2y$` version tag. The native
 * `bcrypt` library only recognises `$2a$` / `$2b$` and returns `false` for
 * `$2y$`, which would lock out every account created from the web app.
 * Normalising the version tag is byte-compatible (the digest is identical)
 * and lets existing web members and admins authenticate through the BFF.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  const normalized = hash.startsWith('$2y$') ? `$2b$${hash.slice(4)}` : hash;
  try {
    return await bcrypt.compare(plain, normalized);
  } catch {
    return false;
  }
}
