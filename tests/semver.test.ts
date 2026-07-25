import { describe, it, expect } from 'vitest'
import { compareSemver, isNewerVersion, parseSemver } from '../src/shared/semver'
import { pickReleaseAsset } from '../src/shared/update-assets'

describe('semver', () => {
  it('parses v-prefixed versions', () => {
    expect(parseSemver('v1.2.3')).toEqual([1, 2, 3])
    expect(parseSemver('0.2.0')).toEqual([0, 2, 0])
  })

  it('compares versions', () => {
    expect(compareSemver('0.3.0', '0.2.0')).toBeGreaterThan(0)
    expect(compareSemver('0.2.0', '0.2.0')).toBe(0)
    expect(compareSemver('0.1.9', '0.2.0')).toBeLessThan(0)
  })

  it('detects newer versions', () => {
    expect(isNewerVersion('0.3.0', '0.2.0')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })
})

describe('pickReleaseAsset', () => {
  const assets = [
    {
      name: 'Archeon Workspace-0.3.0-win-x64-setup.exe',
      size: 100,
      browser_download_url: 'https://example.com/setup.exe'
    },
    {
      name: 'Archeon Workspace-0.3.0-win-x64-portable.exe',
      size: 90,
      browser_download_url: 'https://example.com/portable.exe'
    },
    {
      name: 'Archeon Workspace-0.3.0-linux-x64.AppImage',
      size: 80,
      browser_download_url: 'https://example.com/app.AppImage'
    },
    {
      name: 'Archeon Workspace-0.3.0-linux-x64.deb',
      size: 70,
      browser_download_url: 'https://example.com/app.deb'
    }
  ]

  it('prefers Windows setup exe', () => {
    const a = pickReleaseAsset(assets, 'win32')
    expect(a?.name).toContain('setup')
  })

  it('prefers Linux AppImage', () => {
    const a = pickReleaseAsset(assets, 'linux')
    expect(a?.name).toContain('AppImage')
  })

  it('returns null when no platform match', () => {
    const a = pickReleaseAsset(
      [{ name: 'notes.txt', size: 1, browser_download_url: 'https://x/n' }],
      'win32'
    )
    expect(a).toBeNull()
  })
})
