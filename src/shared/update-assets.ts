/** Pure helpers for choosing update installers (no Electron imports). */

export interface UpdateAssetCandidate {
  name: string
  size: number
  browser_download_url: string
  content_type?: string
}

export interface PickedUpdateAsset {
  name: string
  url: string
  size: number
  contentType?: string
}

/** Choose best download asset for this OS from release assets. */
export function pickReleaseAsset(
  assets: UpdateAssetCandidate[],
  platform: NodeJS.Platform = process.platform
): PickedUpdateAsset | null {
  const list = assets.filter((a) => a.browser_download_url && a.name)
  if (list.length === 0) return null

  const rank = (name: string): number => {
    const n = name.toLowerCase()
    if (platform === 'win32') {
      if (n.includes('setup') && n.endsWith('.exe')) return 100
      if (n.includes('portable') && n.endsWith('.exe')) return 80
      if (n.endsWith('.exe') && !n.includes('blockmap')) return 60
      return -1
    }
    if (platform === 'linux') {
      if (n.endsWith('.appimage')) return 100
      if (n.endsWith('.deb')) return 80
      if (n.endsWith('.rpm')) return 60
      return -1
    }
    if (n.endsWith('.dmg')) return 100
    if (n.endsWith('.zip')) return 80
    return -1
  }

  let best: UpdateAssetCandidate | null = null
  let bestScore = -1
  for (const a of list) {
    const score = rank(a.name)
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  if (!best || bestScore < 0) return null
  return {
    name: best.name,
    url: best.browser_download_url,
    size: best.size,
    contentType: best.content_type
  }
}
