import { describe, it, expect } from 'vitest'
import { extractLoginUrls, stripAnsi } from '../src/shared/login-url'

describe('login-url', () => {
  it('strips ansi before matching', () => {
    expect(stripAnsi('\x1b[90mhello\x1b[0m')).toBe('hello')
  })

  it('extracts claude oauth urls', () => {
    const chunk = `
Browser didn't open? Use the url below to sign in
https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz
Paste code here if prompted
`
    const urls = extractLoginUrls(chunk)
    expect(urls.length).toBe(1)
    expect(urls[0]).toContain('claude.com/cai/oauth/authorize')
  })

  it('ignores unrelated https links', () => {
    expect(extractLoginUrls('see https://example.com/docs')).toEqual([])
  })
})
