// JSON.parse validates syntax; this token walk additionally rejects duplicate raw keys,
// including equivalent escaped names, before any data can be silently overwritten.
export function parseStrictJson(source: string): unknown {
  const result: unknown = JSON.parse(source);
  const tokens = source.match(/"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? [];
  const stack: Array<{ keys?: Set<string>; expectingKey: boolean }> = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '{' || token === '[') stack.push({ keys: token === '{' ? new Set() : undefined, expectingKey: token === '{' });
    else if (token === '}' || token === ']') stack.pop();
    else {
      const frame = stack[stack.length - 1];
      if (!frame?.keys) continue;
      if (token === ',') frame.expectingKey = true;
      else if (frame.expectingKey && token.startsWith('"')) {
        const key = JSON.parse(token) as string;
        if (frame.keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
        frame.keys.add(key); frame.expectingKey = false;
      }
    }
  }
  return result;
}
