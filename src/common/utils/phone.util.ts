/**
 * Normalize phone numbers for matching across central + tenant DBs.
 * Keeps digits only and strips common Tunisian prefixes (216 / leading 0).
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('216') && digits.length > 8) {
    digits = digits.slice(3);
  }
  if (digits.startsWith('0') && digits.length > 8) {
    digits = digits.slice(1);
  }
  return digits;
}

/** SQL expression that normalizes a phone column the same way as normalizePhone(). */
export function phoneSqlExpr(column: string): string {
  return `TRIM(LEADING '0' FROM
    CASE
      WHEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '+', ''), '.', ''), '/', '') LIKE '216%'
        THEN SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '+', ''), '.', ''), '/', ''), 4)
      ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '+', ''), '.', ''), '/', '')
    END
  )`;
}
