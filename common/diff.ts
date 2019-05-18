export type CompactDiffInsert = [1, string];
export type CompactDiffEqual = [0, number];
export type CompactDiffDelete = [-1, number];

export type CompactDiffElem = CompactDiffInsert | CompactDiffEqual | CompactDiffDelete;
export type CompactDiff = CompactDiffElem[];

export function applyCompactDiff(text: string, diff: CompactDiff): string {
  let buffer = '';
  let cursor = 0;
  diff.forEach(elem => {
    switch (elem[0]) {
      case 1:
        buffer += elem[1];
        break;
      case 0: {
        const count = elem[1];
        buffer += text.substr(cursor, count);
        cursor += count;
        break;
      }
      case -1:
        cursor += elem[1];
        break;
    }
  });
  return buffer;
}
