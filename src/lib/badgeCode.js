export function generateBadgeCode(personType, existingCodes, typePrefixes = {}) {
  const prefix = typePrefixes[personType] || 'GE';
  const nums = existingCodes
    .map((code) => {
      if (!code || !code.startsWith(prefix)) return 0;
      const rest = code.startsWith(prefix + '-') ? code.slice(prefix.length + 1) : code.slice(prefix.length);
      const n = parseInt(rest, 10);
      return isNaN(n) ? 0 : n;
    })
    .filter((n) => n > 0);
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}