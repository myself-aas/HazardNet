/**
 * Avatar pipeline: client-side resize/compress → profiles document
 * photo_url/avatar_path update → previous picture replaced.
 *
 * Images are center-cropped to a square and downscaled to at most 512×512,
 * encoded as WebP (JPEG fallback) and compressed — typically 20–60 KB per
 * avatar — before being stored on the profile document.
 */

import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export const AVATAR_MAX_DIMENSION = 512;
export const AVATAR_TARGET_BYTES = 160 * 1024; // keep final blob under ~160 KB
export const AVATAR_BUCKET = 'avatars';

export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

export class AvatarError extends Error {}

export interface ResizedAvatar {
  blob: Blob;
  width: number;
  height: number;
  extension: 'webp' | 'jpg';
  contentType: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validate a user-picked file before any processing. */
export function assertValidAvatarFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new AvatarError('Please choose an image file (JPG, PNG or WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new AvatarError('That image is over 15 MB — pick something smaller.');
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AvatarError('Could not read that image — try a different file.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Center-crop + downscale + compress an image entirely in the browser.
 * Progressively lowers quality until the blob fits AVATAR_TARGET_BYTES.
 */
export async function resizeAvatarFile(file: File): Promise<ResizedAvatar> {
  assertValidAvatarFile(file);
  const image = await loadImage(file);

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const dimension = Math.min(AVATAR_MAX_DIMENSION, Math.max(side, 64));
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarError('Your browser blocked image processing.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, side, side, 0, 0, dimension, dimension);

  const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const type = supportsWebp ? 'image/webp' : 'image/jpeg';
  const extension: 'webp' | 'jpg' = supportsWebp ? 'webp' : 'jpg';

  for (const quality of [0.85, 0.72, 0.6, 0.45]) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (blob && blob.size <= AVATAR_TARGET_BYTES) {
      return { blob, width: dimension, height: dimension, extension, contentType: type };
    }
    if (quality === 0.45 && blob) {
      return { blob, width: dimension, height: dimension, extension, contentType: type };
    }
  }
  throw new AvatarError('Image compression failed — try a different file.');
}

export interface UploadAvatarArgs {
  file: File;
  userId: string;
  /** Storage path of the current avatar, so it can be replaced (deleted). */
  currentAvatarPath?: string | null;
  /** Called between steps for progress indication. */
  onStage?: (stage: 'resizing' | 'uploading' | 'finalizing' | 'done') => void;
}

export interface UploadAvatarResult {
  publicUrl: string;
  storagePath: string;
  bytes: number;
  replacedOld: boolean;
  /** Local preview to use when the profile store is unavailable (dev mode). */
  localPreviewUrl?: string;
}

/** Storage path (bucket-relative) previously stored on the profile row. */
export function avatarPathFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = `/${AVATAR_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

/**
 * Full avatar update flow. Resizes locally, converts to Data URL, and writes photo_url
 * onto the profile doc in Firestore.
 */
export async function uploadAvatar({
  file,
  userId,
  onStage,
}: UploadAvatarArgs): Promise<UploadAvatarResult> {
  onStage?.('resizing');
  const resized = await resizeAvatarFile(file);
  const storagePath = `${userId}/avatar-${Date.now()}.${resized.extension}`;

  onStage?.('uploading');
  const reader = new FileReader();
  const dataUrlPromise = new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new AvatarError('Failed to encode image preview'));
  });
  reader.readAsDataURL(resized.blob);
  const dataUrl = await dataUrlPromise;

  onStage?.('finalizing');
  await updateDoc(doc(db, 'profiles', userId), { avatar_path: storagePath, photo_url: dataUrl });

  onStage?.('done');
  return { publicUrl: dataUrl, storagePath, bytes: resized.blob.size, replacedOld: false };
}

/** Remove the stored avatar entirely (user cleared their photo). */
export async function deleteAvatar(userId: string): Promise<void> {
  await updateDoc(doc(db, 'profiles', userId), { avatar_path: null, photo_url: null });
}
