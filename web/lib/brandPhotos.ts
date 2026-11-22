import { api } from '@/lib/api';

/** Photo files the brand portal accepts (browsers can read these). */
export const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Shrinks a photo in the browser (at most 1600 px, JPEG) so even a large phone photo uploads fast,
 * then uploads it. The server stores it as a small WebP. Returns its link (/api/brand-images/...).
 */
export async function uploadPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: please use a JPG, PNG or WebP photo`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over 25 MB`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background, as on a shop page
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const r = await api<{ url: string }>('/brand/images', { body: { dataUrl } });
  return r.url;
}
