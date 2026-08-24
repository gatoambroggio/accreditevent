// Generates a badge code like "GE-0001-A3".
// The trailing random 2-char suffix prevents duplicate codes under concurrent
// creation (race condition): two operators creating at the same instant would
// otherwise compute the same sequential number from the same stale list and
// produce identical badge codes — a security risk at access validation, since
// badge_code is matched exactly to grant/deny entry. The suffix makes that
// collision astronomically unlikely while keeping the sequential prefix
// readable. Parsing strips any "-XX" suffix so sequencing stays correct even
// when the list mixes legacy (suffix-less) and new (suffixed) codes.
export function generateBadgeCode(personType, existingCodes, typePrefixes = {}) {
  const prefix = typePrefixes[personType] || 'GE';
  const nums = existingCodes
    .map((code) => {
      if (!code || !code.startsWith(prefix)) return 0;
      const rest = code.startsWith(prefix + '-') ? code.slice(prefix.length + 1) : code.slice(prefix.length);
      const core = rest.replace(/-[A-Z0-9]{2}$/, '');
      const n = parseInt(core, 10);
      return isNaN(n) ? 0 : n;
    })
    .filter((n) => n > 0);
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  const core = `${prefix}-${String(next).padStart(4, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${core}-${suffix}`;
}