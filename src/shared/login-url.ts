/**
 * Detect OAuth / login URLs in CLI agent terminal output so the host app
 * can open them in a real browser (Electron PTY cannot launch a browser).
 */

/** Strip common ANSI CSI sequences so URL regex can match. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r/g, '')
}

/**
 * Match login/authorize HTTPS URLs used by Claude, Grok, OpenAI CLIs, etc.
 */
const LOGIN_URL_RE =
  /https:\/\/[a-zA-Z0-9][-a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%]+/g

const LOGIN_HOST_HINT =
  /claude\.com|anthropic\.com|console\.anthropic|x\.ai|openai\.com|auth0\.|okta\.|oauth|login|authorize/i

export function extractLoginUrls(rawTerminalChunk: string): string[] {
  const plain = stripAnsi(rawTerminalChunk)
  const found: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(LOGIN_URL_RE.source, 'g')
  while ((m = re.exec(plain)) !== null) {
    // Trim trailing punctuation that CLIs sometimes leave on the line
    let url = m[0].replace(/[),\];.'"]+$/g, '')
    // Decode common over-escaped fragments is not needed; open as-is
    if (!LOGIN_HOST_HINT.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    found.push(url)
  }
  return found
}
