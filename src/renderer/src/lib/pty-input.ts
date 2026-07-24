import { getArcheonApi } from './ipc'
import { useAppStore } from '../stores/app-store'

/**
 * Write keystrokes to a PTY session. When the source pane is in the broadcast
 * selection, fan out to every selected shell that still has a live session.
 */
export function writePtyInput(paneId: string, sessionId: string, data: string): void {
  let api: ReturnType<typeof getArcheonApi>
  try {
    api = getArcheonApi()
  } catch {
    return
  }

  const { broadcastPaneIds, ptySessionByPane } = useAppStore.getState()
  if (broadcastPaneIds.includes(paneId) && broadcastPaneIds.length > 0) {
    const written = new Set<string>()
    for (const pid of broadcastPaneIds) {
      const sid = ptySessionByPane[pid]
      if (sid && !written.has(sid)) {
        written.add(sid)
        api.pty.write(sid, data)
      }
    }
    // Ensure the originating session still receives input even if map is stale
    if (!written.has(sessionId)) {
      api.pty.write(sessionId, data)
    }
    return
  }

  api.pty.write(sessionId, data)
}
