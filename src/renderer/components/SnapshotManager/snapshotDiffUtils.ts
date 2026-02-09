import type { DiffEntry } from '@shared/types/common.types';

const SKIP_PATTERNS = [
  /^#/,
  /^$/,
  /^diff\s/,
  /^batch\s/,
  /^defaults\s/,
  /^board_name\s/,
  /^manufacturer_id\s/,
  /^mcu_id\s/,
  /^signature\s/,
  /^profile\s/,
  /^rateprofile\s/,
  /^save$/,
];

export function parseCLIDiff(cliDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!cliDiff) return result;

  const lines = cliDiff.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || SKIP_PATTERNS.some(p => p.test(line))) continue;

    const setMatch = line.match(/^set\s+(\S+)\s*=\s*(.+)$/);
    if (setMatch) {
      result.set(`set ${setMatch[1]}`, setMatch[2].trim());
      continue;
    }

    const featureMatch = line.match(/^feature\s+(-?\S+)$/);
    if (featureMatch) {
      result.set(`feature ${featureMatch[1]}`, '(enabled)');
      continue;
    }

    const serialMatch = line.match(/^serial\s+(\d+)\s+(.+)$/);
    if (serialMatch) {
      result.set(`serial ${serialMatch[1]}`, serialMatch[2].trim());
      continue;
    }

    const auxMatch = line.match(/^aux\s+(\d+)\s+(.+)$/);
    if (auxMatch) {
      result.set(`aux ${auxMatch[1]}`, auxMatch[2].trim());
      continue;
    }

    const genericMatch = line.match(/^(\S+)\s+(.+)$/);
    if (genericMatch) {
      result.set(genericMatch[1], genericMatch[2].trim());
      continue;
    }
  }

  return result;
}

export function computeDiff(
  before: Map<string, string>,
  after: Map<string, string>
): DiffEntry[] {
  const entries: DiffEntry[] = [];

  for (const [key, newValue] of after) {
    const oldValue = before.get(key);
    if (oldValue === undefined) {
      entries.push({ key, newValue, status: 'added' });
    } else if (oldValue !== newValue) {
      entries.push({ key, oldValue, newValue, status: 'changed' });
    }
  }

  for (const [key, oldValue] of before) {
    if (!after.has(key)) {
      entries.push({ key, oldValue, status: 'removed' });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export function groupDiffByCommand(entries: DiffEntry[]): Map<string, DiffEntry[]> {
  const groups = new Map<string, DiffEntry[]>();

  for (const entry of entries) {
    const spaceIdx = entry.key.indexOf(' ');
    const command = spaceIdx > 0 ? entry.key.substring(0, spaceIdx) : entry.key;

    const group = groups.get(command);
    if (group) {
      group.push(entry);
    } else {
      groups.set(command, [entry]);
    }
  }

  return groups;
}
