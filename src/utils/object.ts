export function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge target with source. Arrays are REPLACED.
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          (output as any)[key] = deepMerge((target as any)[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

/**
 * Compare edited against base. Returns an object containing only the fields
 * in edited that are DIFFERENT from base.
 * If edited removes a field that exists in base, it sets the value to undefined (or handles it).
 * Note: Arrays are compared for equality (simple JSON.stringify) and replaced if different.
 */
export function deepDiff(base: any, edited: any): any {
  if (!isObject(base) || !isObject(edited)) {
    // If they are strictly equal, return undefined to indicate no diff
    if (base === edited) return undefined;
    
    // For arrays or primitives, compare via JSON stringify to avoid false positives on arrays
    if (Array.isArray(base) && Array.isArray(edited)) {
      if (JSON.stringify(base) === JSON.stringify(edited)) return undefined;
    }
    
    return edited;
  }

  const diff: any = {};
  let hasDiff = false;

  const allKeys = new Set([...Object.keys(base), ...Object.keys(edited)]);

  for (const key of allKeys) {
    if (!(key in base)) {
      // New key added in edited
      diff[key] = edited[key];
      hasDiff = true;
    } else if (!(key in edited)) {
      // Key removed in edited. We use a special marker or null.
      // For JSON stringify, `undefined` is stripped.
      // In overriding logic, we might need a way to say "delete this key".
      // But for simplicity in SingBox templates, users rarely delete template keys; they override them.
      // We will assign `undefined` so that `JSON.stringify` drops it from overrides, meaning we don't support deleting base keys yet,
      // OR we can assign `null` if the base was not null.
      if (base[key] !== null && base[key] !== undefined) {
         // To properly delete keys via deepMerge, we would need to handle null.
         // Let's just drop it. Template overrides typically don't delete keys.
      }
    } else {
      // Key exists in both
      const valueDiff = deepDiff(base[key], edited[key]);
      if (valueDiff !== undefined) {
        diff[key] = valueDiff;
        hasDiff = true;
      }
    }
  }

  return hasDiff ? diff : undefined;
}
