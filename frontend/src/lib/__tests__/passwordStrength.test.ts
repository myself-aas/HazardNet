import {
  PASSWORD_REQUIREMENTS,
  passwordStrength,
  scorePassword,
  scorePasswordRequirements,
} from '../passwordStrength'

describe('scorePassword (legacy 0–4 score)', () => {
  it('scores empty passwords as 0', () => {
    expect(scorePassword('')).toBe(0)
  })

  it('rewards length, mixed case, digits and symbols', () => {
    expect(scorePassword('short')).toBeLessThan(scorePassword('longenough'))
    expect(scorePassword('LongEnough12')).toBeGreaterThan(scorePassword('longenough'))
    expect(scorePassword('Longenou1!')).toBe(scorePassword('Longenou1') + 1)
  })

  it('caps at 4', () => {
    expect(scorePassword('Sup3r$ecretLongPassword!!')).toBeLessThanOrEqual(4)
  })
})

describe('PASSWORD_REQUIREMENTS + scorePasswordRequirements', () => {
  it('checks each requirement independently', () => {
    expect(scorePasswordRequirements('abcdefgh')).toBe(1)
    expect(scorePasswordRequirements('Abcdefgh')).toBe(2)
    expect(scorePasswordRequirements('Abcdefg1')).toBe(3)
    expect(scorePasswordRequirements('Abcdefg1!')).toBe(4)
  })
})

describe('passwordStrength labels', () => {
  it('returns progressive labels with tailwind classes', () => {
    expect(passwordStrength('').label).toBe('Too weak')
    expect(passwordStrength('onlylower').label).toBe('Weak')
    expect(passwordStrength('Onlylower1').label).toBe('Good')
    expect(passwordStrength('Onlylower1!').label).toBe('Strong')
    expect(passwordStrength('Onlylower1!').barClass).toMatch(/bg-/)
    expect(passwordStrength('Onlylower1!').textClass).toMatch(/text-/)
  })
})
