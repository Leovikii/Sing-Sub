// TEMPORARY: 3.1.6 upgrade boundary. Remove in 3.1.7 after the retirement
// checks in docs/agent/metadata-compat-retirement.md. Never write this format.
import { entityMetadataSchema, type EntityMetadata, type JsonAsset } from '../../../shared';
import { readRulesetMetadata } from '../../lib/rulesets';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function extractNote(value: Record<string, unknown>, path: string): string | undefined {
  const note = value.note;
  const reserved = value._sing_sub;
  if (note !== undefined && typeof note !== 'string') throw new Error(`${path}: invalid management note`);
  let nested: string | undefined;
  if (reserved !== undefined) {
    if (!record(reserved) || Object.keys(reserved).some(key => key !== 'note') ||
        (reserved.note !== undefined && typeof reserved.note !== 'string')) throw new Error(`${path}: unknown _sing_sub management field`);
    nested = reserved.note as string | undefined;
  }
  if (note !== undefined && nested !== undefined && note !== nested) throw new Error(`${path}: conflicting management notes`);
  delete value.note; delete value._sing_sub;
  return note as string | undefined ?? nested;
}
export function splitLegacyAsset(asset: JsonAsset, previous: EntityMetadata = {}): { asset: JsonAsset; metadata: EntityMetadata } {
  const root = asset.content;
  const managed = (value: unknown) => record(value) && (value.note !== undefined || value._sing_sub !== undefined);
  const nested = Array.isArray(root) ? root : record(root) ? [...(Array.isArray(root.inbounds) ? root.inbounds : []), ...(Array.isArray(root.outbounds) ? root.outbounds : [])] : [];
  // Most reads/writes are already pure: do not clone megabytes of body JSON.
  const content = managed(root) || nested.some(managed) ? structuredClone(root) : root;
  const metadata = structuredClone(previous);
  let note: string | undefined;
  if (asset.path.startsWith('sing-sub/rulesets/')) {
    if (!record(content)) throw new Error(`${asset.path}: invalid ruleset`);
    if (content._sing_sub !== undefined) {
      const legacy = readRulesetMetadata(JSON.stringify(content));
      note = legacy.note;
      metadata.editor = { ...metadata.editor, ruleset: {
        manual: legacy.manual,
        sources: legacy.sources.map(source => ({ url: source.url, intervalHours: source.interval_hours as 0 | 24 | 168 | 720 | 8760,
          ...(source.last_updated ? { lastFetchedAt: source.last_updated } : {}) })),
      } };
      delete content._sing_sub;
    }
    if (Object.keys(content).some(key => !['version', 'rules'].includes(key)) ||
        ![1, 2, 3, 4].includes(content.version as number) || !Array.isArray(content.rules)) throw new Error(`${asset.path}: invalid pure ruleset`);
  } else {
    if (record(content)) note = extractNote(content, asset.path);
    const annotations = [...(metadata.editor?.annotations ?? [])];
    const groups: Array<['inbound' | 'outbound', unknown]> = Array.isArray(content) ? [['outbound', content]] :
      record(content) ? [['inbound', content.inbounds], ['outbound', content.outbounds]] : [];
    for (const [direction, items] of groups) {
      if (!Array.isArray(items)) continue;
      const tags = items.map(item => record(item) ? item.tag : undefined);
      for (const item of items) {
        if (!record(item) || (item.note === undefined && item._sing_sub === undefined)) continue;
        if (typeof item.tag !== 'string' || !item.tag || tags.filter(tag => tag === item.tag).length !== 1) throw new Error(`${asset.path}: ${direction} annotation requires a unique tag`);
        const itemNote = extractNote(item, `${asset.path}/${direction}/${item.tag}`);
        if (itemNote !== undefined) {
          const old = annotations.find(entry => entry.direction === direction && entry.tag === item.tag);
          if (old && old.note !== itemNote) throw new Error(`${asset.path}: conflicting annotation for ${item.tag}`);
          if (!old) annotations.push({ direction, tag: item.tag, note: itemNote });
        }
      }
    }
    if (annotations.length) metadata.editor = { ...metadata.editor, annotations };
  }
  if (asset.note !== undefined && note !== undefined && asset.note !== note) throw new Error(`${asset.path}: wrapper/body note conflict`);
  if (asset.note !== undefined || note !== undefined) metadata.note = asset.note ?? note;
  if (asset.updatedAt) metadata.updatedAt = asset.updatedAt;
  entityMetadataSchema.parse(metadata);
  return { asset: { path: asset.path, content }, metadata };
}
