jest.mock('../../services/firebase', () => ({
  db: {},
}))

import {
  AVATAR_BUCKET,
  AVATAR_MAX_DIMENSION,
  AVATAR_TARGET_BYTES,
  AvatarError,
  assertValidAvatarFile,
  avatarPathFromUrl,
  formatBytes,
} from '../avatar'

const makeFile = (type: string, size: number): File => {
  const content = new ArrayBuffer(Math.max(size, 1))
  return new File([content], 'avatar', { type })
}

describe('avatar validation', () => {
  it('accepts image files within the size limit', () => {
    expect(() => assertValidAvatarFile(makeFile('image/png', 1024))).not.toThrow()
    expect(() => assertValidAvatarFile(makeFile('image/webp', 5 * 1024 * 1024))).not.toThrow()
  })

  it('rejects non-image files', () => {
    expect(() => assertValidAvatarFile(makeFile('application/pdf', 1024))).toThrow(AvatarError)
    expect(() => assertValidAvatarFile(makeFile('application/pdf', 1024))).toThrow(/image file/i)
  })

  it('rejects oversized files', () => {
    expect(() => assertValidAvatarFile(makeFile('image/jpeg', 20 * 1024 * 1024))).toThrow(/15 MB/i)
  })
})

describe('constants', () => {
  it('keeps avatars small on purpose', () => {
    expect(AVATAR_MAX_DIMENSION).toBe(512)
    expect(AVATAR_TARGET_BYTES).toBeLessThan(200 * 1024)
    expect(AVATAR_BUCKET).toBe('avatars')
  })
})

describe('formatBytes', () => {
  it('formats human-readable sizes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})

describe('avatarPathFromUrl', () => {
  it('extracts the storage path from a public avatar URL', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1700000000.webp'
    expect(avatarPathFromUrl(url)).toBe('user-1/avatar-1700000000.webp')
  })

  it('returns null for non-avatar URLs and junk', () => {
    expect(avatarPathFromUrl('https://example.com/photo.jpg')).toBeNull()
    expect(avatarPathFromUrl('not-a-url')).toBeNull()
    expect(avatarPathFromUrl(null)).toBeNull()
  })
})
