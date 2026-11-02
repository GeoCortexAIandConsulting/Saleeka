import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Read the folders on every request so newly dropped photos show up after a refresh.
export const dynamic = 'force-dynamic';

const ROOT = path.join(process.cwd(), 'public', 'silhouettes');
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SAFE = /^[a-z0-9-]+$/;
// Anything this small is a failed save (blank placeholder), not a photo: skip it so the drawing shows.
const MIN_BYTES = 4 * 1024;
// Folders kept under an older style name: women/shirt-trouser holds the "Western style" photos.
const FOLDER_ALIAS: Record<string, string> = { 'women/shirt-trouser': 'western' };

/**
 * Lists photos in public/silhouettes/<women|men>/<style>/ as { "female:anarkali": ["/silhouettes/…", …] }.
 * Files are sorted by name, so 1.jpg / 2.jpg / 3.jpg (or a-…, b-…) control the order.
 */
export async function GET() {
  const out: Record<string, string[]> = {};
  for (const [gender, dir] of [['female', 'women'], ['male', 'men']] as const) {
    const styles = await readdir(path.join(ROOT, dir), { withFileTypes: true }).catch(() => []);
    for (const style of styles) {
      if (!style.isDirectory() || !SAFE.test(style.name)) continue;
      const files = await readdir(path.join(ROOT, dir, style.name)).catch(() => [] as string[]);
      const sized = await Promise.all(
        files.filter((f) => IMAGE.test(f)).map(async (f) => ((await stat(path.join(ROOT, dir, style.name, f)).catch(() => null))?.size ?? 0) >= MIN_BYTES ? f : null),
      );
      const images = sized.filter((f): f is string => !!f).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      // Skip exact duplicates (the same photo saved twice under different names).
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const f of images) {
        const hash = createHash('sha1').update(await readFile(path.join(ROOT, dir, style.name, f))).digest('hex');
        if (!seen.has(hash)) { seen.add(hash); unique.push(f); }
      }
      images.splice(0, images.length, ...unique);
      const styleKey = FOLDER_ALIAS[`${dir}/${style.name}`] ?? style.name;
      if (images.length && !out[`${gender}:${styleKey}`]) out[`${gender}:${styleKey}`] = images.map((f) => `/silhouettes/${dir}/${style.name}/${encodeURIComponent(f)}`);
    }
  }
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
