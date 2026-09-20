import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import MaterialIcon from '../MaterialIcon';
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_MAX_DIMENSION,
  AvatarError,
  deleteAvatar,
  formatBytes,
  resizeAvatarFile,
  uploadAvatar,
} from '../../lib/avatar';

/**
 * Profile-picture field for the user dashboard.
 *
 * · Client-side resize: square center-crop → ≤512×512 → WebP/JPEG ≤ ~160 KB
 *   (keeps the stored profile picture small).
 * · Replace-on-update: the previous picture is replaced on the profile document.
 * · Instant local preview while the network round-trip completes.
 */

export const UserAvatarField: React.FC<{ size?: number; editable?: boolean }> = ({ size = 96, editable = true }) => {
  const { user, userProfile, updateUserProfile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const photoURL = preview ?? userProfile?.photoURL ?? undefined;
  const initial = (userProfile?.displayName || user?.email || 'U').charAt(0).toUpperCase();

  const handleFile = async (file: File) => {
    setBusy(true);
    setMenuOpen(false);
    try {
      const resized = await resizeAvatarFile(file);
      setPreview(URL.createObjectURL(resized.blob));
      setStage('Compressed to ' + formatBytes(resized.blob.size));
      if (!user) {
        // Design preview without an authenticated user: show the local result only.
        toast('Design preview — sign in to store your photo.', { icon: 'ℹ️' });
        setStage(null);
        return;
      }
      const result = await uploadAvatar({
        file,
        userId: user.uid,
        currentAvatarPath: userProfile?.avatarPath ?? null,
        onStage: (s) =>
          setStage(
            s === 'resizing'
              ? 'Resizing…'
              : s === 'uploading'
                ? 'Uploading…'
                : s === 'finalizing'
                  ? 'Replacing old photo…'
                  : null,
          ),
      });
      await updateUserProfile({ photoURL: result.publicUrl, avatarPath: result.storagePath });
      await refreshProfile();
      toast.success(`Profile picture updated — ${formatBytes(result.bytes)} (max ${AVATAR_MAX_DIMENSION}px, old photo removed).`);
      setStage(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not update your profile picture.');
      setStage(null);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    if (!user) return;
    setBusy(true);
    try {
      await deleteAvatar(user.uid);
      await updateUserProfile({ photoURL: '', avatarPath: undefined });
      await refreshProfile();
      setPreview(null);
      toast.success('Profile picture removed.');
    } catch (error) {
      console.error(error);
      toast.error('Could not remove your profile picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {photoURL ? (
          <img
            src={photoURL}
            alt="Profile"
            className="h-full w-full rounded-full border-2 border-white object-cover shadow-md"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-carbon-black shadow-md"
            style={{ fontSize: size * 0.36 }}
          >
            <span className="font-black">{initial}</span>
          </div>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-carbon-black/40">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          </span>
        )}
      </div>

      {editable && (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl bg-carbon-90 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-carbon-80 disabled:opacity-50 cursor-pointer"
            >
              <MaterialIcon name="photo_camera" size={15} />
              {photoURL ? 'Replace photo' : 'Upload photo'}
            </button>
            {photoURL && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRemove}
                className="rounded-xl border border-carbon-20 px-3 py-2 text-xs font-bold text-carbon-60 transition-colors hover:bg-carbon-05 disabled:opacity-50 cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-carbon-60" aria-live="polite">
            {stage ??
              `JPG, PNG or WebP — auto-resized to ${AVATAR_MAX_DIMENSION}×${AVATAR_MAX_DIMENSION}px & compressed, old copy replaced.`}
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
};
