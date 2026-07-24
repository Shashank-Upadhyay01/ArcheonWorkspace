import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  chatThreadPath,
  loadChatThread,
  saveChatThread,
  ChatThreadPathError
} from '../src/main/session-chat'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archeon-chat-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('chatThreadPath', () => {
  it('builds sessions/{ws}/panes/{paneId}.json', () => {
    const file = chatThreadPath(dir, { workspaceId: 'ws-1', paneId: 'pane-2' })
    expect(file).toBe(path.join(dir, 'ws-1', 'panes', 'pane-2.json'))
  })

  it('rejects path traversal ids', () => {
    expect(() =>
      chatThreadPath(dir, { workspaceId: '../x', paneId: 'pane' })
    ).toThrow(ChatThreadPathError)
    expect(() =>
      chatThreadPath(dir, { workspaceId: 'ws', paneId: 'a/b' })
    ).toThrow(ChatThreadPathError)
  })
})

describe('saveChatThread / loadChatThread', () => {
  it('round-trips messages', () => {
    const key = { workspaceId: 'wsA', paneId: 'paneB' }
    saveChatThread(dir, key, {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ]
    })
    const loaded = loadChatThread(dir, key)
    expect(loaded).toEqual({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ]
    })
  })

  it('returns null when missing or corrupt', () => {
    expect(loadChatThread(dir, { workspaceId: 'ws', paneId: 'none' })).toBeNull()
    const key = { workspaceId: 'ws', paneId: 'bad' }
    const file = chatThreadPath(dir, key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{not json', 'utf8')
    expect(loadChatThread(dir, key)).toBeNull()
  })

  it('rejects invalid role via schema on save', () => {
    expect(() =>
      saveChatThread(dir, { workspaceId: 'ws', paneId: 'p' }, {
        messages: [{ role: 'tool' as 'user', content: 'x' }]
      })
    ).toThrow()
  })
})
