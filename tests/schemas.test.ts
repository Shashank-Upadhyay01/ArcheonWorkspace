import { describe, it, expect } from 'vitest'
import { workspaceSchema, parseWorkspace } from '../src/shared/schemas'

const validWorkspace = {
  id: 'ws_1',
  name: 'Default',
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
  layout: { type: 'leaf', paneId: 'p1' },
  panes: {
    p1: {
      id: 'p1',
      name: 'Shell',
      color: '#3dd6c6',
      type: 'shell',
      shell: { shellId: 'default', cwd: '/tmp' }
    }
  },
  activePaneId: 'p1'
}

describe('workspaceSchema', () => {
  it('accepts a valid workspace', () => {
    expect(parseWorkspace(validWorkspace).id).toBe('ws_1')
  })
  it('rejects missing name', () => {
    const { name, ...bad } = validWorkspace
    expect(() => parseWorkspace(bad)).toThrow()
  })
  it('rejects invalid pane type', () => {
    const bad = structuredClone(validWorkspace)
    ;(bad.panes.p1 as { type: string }).type = 'magic'
    expect(() => parseWorkspace(bad)).toThrow()
  })
})
