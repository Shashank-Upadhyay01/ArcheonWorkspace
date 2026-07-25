/**
 * Best-effort native rebuild for Electron.
 * node-pty ships prebuilds for common platforms; if Visual Studio / build tools
 * are missing, packaging and dev still work via those prebuilds.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const isWin = process.platform === 'win32'
const npx = isWin ? 'npx.cmd' : 'npx'

const result = spawnSync(
  npx,
  ['electron-builder', 'install-app-deps'],
  {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: isWin,
    env: process.env
  }
)

if (result.status !== 0) {
  console.warn(
    '[archeon] Native rebuild skipped or failed (this is OK if node-pty prebuilds are present).'
  )
  console.warn(
    '[archeon] For a full rebuild on Windows, install Visual Studio Build Tools with C++.'
  )
  process.exit(0)
}
