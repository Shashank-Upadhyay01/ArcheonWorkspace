/**
 * Custom auto-updater (no electron-updater).
 *
 * Flow:
 * 1. Query GitHub Releases API for the latest tag
 * 2. Pick a platform-appropriate asset (setup.exe / AppImage / deb)
 * 3. Download to userData/updates with progress callbacks
 * 4. Optionally launch the installer / open the package
 *
 * User data (workspaces, keys) lives outside the install dir and is preserved.
 */

import { app, shell } from 'electron'
import { createWriteStream } from 'fs'
import fs from 'fs/promises'
import { createHash } from 'crypto'
import http from 'http'
import https from 'https'
import path from 'path'
import { pipeline } from 'stream/promises'
import { isNewerVersion } from '../shared/semver'
import { pickReleaseAsset } from '../shared/update-assets'

export const DEFAULT_UPDATE_REPO = 'Shashank-Upadhyay01/ArcheonWorkspace'

export interface UpdateAsset {
  name: string
  url: string
  size: number
  contentType?: string
}

export interface UpdateInfo {
  version: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
  asset: UpdateAsset
  currentVersion: string
}

export interface UpdateCheckResult {
  updateAvailable: boolean
  currentVersion: string
  info?: UpdateInfo
  message?: string
}

export interface DownloadProgress {
  transferred: number
  total: number
  percent: number
}

export type ProgressFn = (p: DownloadProgress) => void

interface GitHubReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  content_type?: string
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  draft?: boolean
  prerelease?: boolean
  assets: GitHubReleaseAsset[]
}

export function getUpdateRepo(): string {
  return (
    process.env.ARCHEON_UPDATE_REPO?.trim() ||
    process.env.npm_package_update_repo?.trim() ||
    DEFAULT_UPDATE_REPO
  )
}

function httpGetJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ArcheonWorkspace-Updater',
          'X-GitHub-Api-Version': '2022-11-28',
          ...headers
        }
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          httpGetJson<T>(res.headers.location, headers).then(resolve, reject)
          res.resume()
          return
        }
        if (res.statusCode !== 200) {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            reject(
              new Error(
                `Update check failed (${res.statusCode}): ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`
              )
            )
          })
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
          } catch (err) {
            reject(err)
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(30_000, () => {
      req.destroy(new Error('Update check timed out'))
    })
  })
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: ProgressFn
): Promise<{ bytes: number; sha256: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'ArcheonWorkspace-Updater'
        }
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest, onProgress).then(resolve, reject)
          res.resume()
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let transferred = 0
        const hash = createHash('sha256')
        const out = createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          hash.update(chunk)
          if (onProgress) {
            onProgress({
              transferred,
              total,
              percent: total > 0 ? Math.min(100, (transferred / total) * 100) : 0
            })
          }
        })

        pipeline(res, out)
          .then(() => {
            resolve({ bytes: transferred, sha256: hash.digest('hex') })
          })
          .catch(reject)
      }
    )
    req.on('error', reject)
    req.setTimeout(10 * 60_000, () => {
      req.destroy(new Error('Download timed out'))
    })
  })
}

export class AppUpdater {
  private readonly repo: string
  private readonly currentVersion: string
  private lastInfo: UpdateInfo | null = null
  private downloadPath: string | null = null

  constructor(opts?: { repo?: string; currentVersion?: string }) {
    this.repo = opts?.repo ?? getUpdateRepo()
    this.currentVersion = opts?.currentVersion ?? app.getVersion()
  }

  getCurrentVersion(): string {
    return this.currentVersion
  }

  getLastInfo(): UpdateInfo | null {
    return this.lastInfo
  }

  getDownloadedPath(): string | null {
    return this.downloadPath
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.currentVersion
    const url = `https://api.github.com/repos/${this.repo}/releases/latest`

    let release: GitHubRelease
    try {
      release = await httpGetJson<GitHubRelease>(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // No releases yet, private repo, or offline
      return {
        updateAvailable: false,
        currentVersion,
        message:
          message.includes('404') || message.includes('Not Found')
            ? 'No public releases yet. Publish a GitHub Release to enable updates.'
            : `Could not check for updates: ${message}`
      }
    }

    if (release.draft) {
      return {
        updateAvailable: false,
        currentVersion,
        message: 'Latest release is a draft.'
      }
    }

    const version = release.tag_name.replace(/^v/i, '')
    if (!isNewerVersion(version, currentVersion)) {
      return {
        updateAvailable: false,
        currentVersion,
        message: `You are on the latest version (${currentVersion}).`
      }
    }

    const asset = pickReleaseAsset(release.assets ?? [])
    if (!asset) {
      return {
        updateAvailable: false,
        currentVersion,
        message: `Update ${version} exists but has no installer for this platform.`
      }
    }

    const info: UpdateInfo = {
      version,
      name: release.name || version,
      body: release.body || '',
      htmlUrl: release.html_url,
      publishedAt: release.published_at,
      asset,
      currentVersion
    }
    this.lastInfo = info
    return { updateAvailable: true, currentVersion, info }
  }

  async downloadUpdate(onProgress?: ProgressFn): Promise<{ path: string; sha256: string }> {
    const info = this.lastInfo
    if (!info) {
      throw new Error('No update selected. Call checkForUpdates first.')
    }

    const dir = path.join(app.getPath('userData'), 'updates')
    await fs.mkdir(dir, { recursive: true })
    const dest = path.join(dir, info.asset.name)

    // Remove previous partial/failed file
    try {
      await fs.unlink(dest)
    } catch {
      /* ok */
    }

    const { sha256 } = await downloadFile(info.asset.url, dest, onProgress)
    const stat = await fs.stat(dest)
    if (info.asset.size > 0 && Math.abs(stat.size - info.asset.size) > 1024) {
      // Allow small header/CDN differences but catch truncated downloads
      if (stat.size < info.asset.size * 0.95) {
        throw new Error(
          `Download incomplete (${stat.size} bytes, expected ~${info.asset.size}).`
        )
      }
    }

    this.downloadPath = dest
    return { path: dest, sha256 }
  }

  /**
   * Launch the downloaded installer / package.
   * On Windows NSIS: starts setup then quits the app so files can be replaced.
   * On Linux: opens the AppImage/deb with the system handler.
   */
  async installDownloaded(): Promise<{ quitAfter: boolean }> {
    const file = this.downloadPath
    if (!file) {
      throw new Error('No downloaded update. Download first.')
    }
    await fs.access(file)

    const lower = file.toLowerCase()
    if (process.platform === 'win32' && lower.endsWith('.exe')) {
      // Launch installer; user completes UI (unsigned builds may show SmartScreen).
      const { spawn } = await import('child_process')
      spawn(file, [], {
        detached: true,
        stdio: 'ignore'
      }).unref()
      return { quitAfter: true }
    }

    // AppImage / deb / other: open with OS
    const err = await shell.openPath(file)
    if (err) {
      // Fallback: reveal in folder
      shell.showItemInFolder(file)
      throw new Error(err || 'Could not open installer')
    }
    // For .deb user installs via software center; for AppImage they can run the new file
    return { quitAfter: lower.endsWith('.deb') }
  }

  async openReleasePage(): Promise<void> {
    const url =
      this.lastInfo?.htmlUrl || `https://github.com/${this.repo}/releases/latest`
    await shell.openExternal(url)
  }
}
