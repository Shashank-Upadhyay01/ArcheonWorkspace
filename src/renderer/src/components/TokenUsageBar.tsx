import { remainingTokens, usagePercent } from '@shared/token-budget'

export interface TokenUsageBarProps {
  used: number
  limit: number
  compact?: boolean
  label?: string
}

/**
 * Elegant token budget bar for agent panes / tabs.
 */
export default function TokenUsageBar({
  used,
  limit,
  compact = false,
  label
}: TokenUsageBarProps): JSX.Element {
  const pct = usagePercent(used, limit)
  const remaining = remainingTokens(used, limit)
  const tone = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok'
  const usedK = formatTokens(used)
  const limitK = formatTokens(limit)
  const remK = formatTokens(remaining)

  return (
    <div
      className={
        compact
          ? `token-bar token-bar--compact token-bar--${tone}`
          : `token-bar token-bar--${tone}`
      }
      title={`${used.toLocaleString()} / ${limit.toLocaleString()} tokens · ${remaining.toLocaleString()} remaining`}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Token usage'}
    >
      <div className="token-bar-track">
        <div className="token-bar-fill" style={{ width: `${pct}%` }} />
        <div className="token-bar-glow" style={{ left: `calc(${pct}% - 6px)` }} />
      </div>
      {!compact ? (
        <div className="token-bar-meta">
          <span className="token-bar-used">{usedK}</span>
          <span className="token-bar-sep">/</span>
          <span className="token-bar-limit">{limitK}</span>
          <span className="token-bar-remain">{remK} left</span>
        </div>
      ) : (
        <span className="token-bar-mini">
          {usedK}/{limitK}
        </span>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.max(0, Math.round(n)))
}
