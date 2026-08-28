import {
  RESERVED_USERNAMES,
  profilePath,
  sanitizeUsernameInput,
  seedFromIdentity,
  suggestUsernames,
  validateUsername,
} from '../username'

describe('sanitizeUsernameInput', () => {
  it('lowercases and strips invalid characters while typing', () => {
    expect(sanitizeUsernameInput('Ashif Ahmed!92')).toBe('ashifahmed92')
    expect(sanitizeUsernameInput('  AB_cD--99  ')).toBe('ab_cd99')
    expect(sanitizeUsernameInput('user@example.com')).toBe('userexamplecom')
    expect(sanitizeUsernameInput('oku##__x')).toBe('oku__x')
  })

  it('keeps lowercase letters, digits and underscores only', () => {
    expect(sanitizeUsernameInput('aBc_123-XYZ')).toBe('abc_123xyz')
  })
})

describe('validateUsername', () => {
  it('accepts a clean username', () => {
    const result = validateUsername('ashif_ahmed')
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.message).toBeNull()
  })

  it('rejects short usernames', () => {
    expect(validateUsername('ab')).toMatchObject({ valid: false, issues: ['too_short'] })
  })

  it('rejects long usernames', () => {
    expect(validateUsername('a'.repeat(21))).toMatchObject({ valid: false, issues: ['too_long'] })
  })

  it('requires the first character to be a letter', () => {
    expect(validateUsername('1farmer')).toMatchObject({ valid: false, issues: ['must_start_letter'] })
    expect(validateUsername('_farmer')).toMatchObject({ valid: false, issues: ['must_start_letter'] })
  })

  it('rejects consecutive and trailing underscores', () => {
    expect(validateUsername('ash__if').issues).toContain('double_underscore')
    expect(validateUsername('ashif_').issues).toContain('trailing_underscore')
  })

  it('rejects reserved words', () => {
    for (const reserved of ['admin', 'dashboard', 'hazardnet']) {
      expect(RESERVED_USERNAMES.has(reserved)).toBe(true)
      expect(validateUsername(reserved).issues).toContain('reserved')
    }
  })
})

describe('seedFromIdentity', () => {
  it('seeds from the display name', () => {
    expect(seedFromIdentity('Ashif Ahmed', null)).toBe('ashif_ahmed')
  })

  it('falls back to the email local-part', () => {
    expect(seedFromIdentity('', 'ash92@mail.co')).toBe('ash92')
  })

  it('degrades to a farmer seed when nothing usable remains', () => {
    expect(seedFromIdentity('!!!', '///')).toMatch(/^farmer/)
  })
})

describe('suggestUsernames', () => {
  it('suggests lowercase/underscore/number variants for an invalid input', () => {
    const suggestions = suggestUsernames({ username: 'A', fullName: 'Ashif Ahmed', email: 'ash92@mail.co' })
    expect(suggestions.length).toBeGreaterThan(0)
    for (const suggestion of suggestions) {
      expect(suggestion).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(suggestion.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('suggests numbered variants when the input is already valid but taken', () => {
    const suggestions = suggestUsernames({ username: 'ashif', fullName: 'Ashif', email: null })
    expect(suggestions).toContain('ashif')
    expect(suggestions.some((suggestion) => /_\d+$/.test(suggestion))).toBe(true)
  })

  it('never suggests reserved words', () => {
    const suggestions = suggestUsernames({ username: 'admin', fullName: null, email: null })
    expect(suggestions).not.toContain('admin')
  })
})

describe('profilePath', () => {
  it('builds the unique profile URL', () => {
    expect(profilePath('ashif_ahmed')).toBe('/u/ashif_ahmed')
  })
})
