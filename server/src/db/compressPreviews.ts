/**
 * One-off: shrinks the AI previews already in MongoDB (PNG, about 1.7 MB each) to WebP, the format
 * new previews are saved in. Safe to run again: images already in WebP are skipped.
 *
 *   npm run previews:compress -- --dry-run   # report only
 *   npm run previews:compress
 */
import { config } from '../config.js';
import { connectMongo } from './mongo.js';
import { compressImage } from '../services/preview.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { client, db } = await connectMongo(config.mongoUri, config.mongoDb);
  try {
    const col = db.collection<{ _id: string; mime: string; data: string }>('previews');
    let before = 0;
    let after = 0;
    let done = 0;
    // One at a time: each image is a megabyte or two, so the whole collection is never held at once.
    for await (const doc of col.find({ mime: { $ne: 'image/webp' } })) {
      // Model photos go back to Gemini with every look, so they keep more detail.
      const small = await compressImage({ mime: doc.mime, data: doc.data }, String(doc._id).startsWith('base-') ? 95 : 90);
      if (small.mime !== 'image/webp') continue;
      before += Buffer.byteLength(doc.data, 'base64');
      after += Buffer.byteLength(small.data, 'base64');
      done++;
      if (!dryRun) await col.updateOne({ _id: doc._id }, { $set: { mime: small.mime, data: small.data } });
    }
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    console.log(`${dryRun ? 'Would shrink' : 'Shrank'} ${done} previews: ${mb(before)} -> ${mb(after)}${done ? ` (about ${Math.round(after / done / 1024)} KB each)` : ''}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
