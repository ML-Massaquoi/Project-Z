import { useEffect, useRef } from 'react'

interface MetricRingProps {
  value: number   // 0-100
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
  animate?: boolean
}

export function MetricRing({
  value,
  size = 80,
  strokeWidth = 6,
  color = '#2563EB',
  label,
  sublabel,
  animate = true,
}: MetricRingProps) {
  const circleRef = useRef<SVGCircleElement>(null)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedValue = Math.min(100, Math.max(0, value))
  const offset = circumference - (clampedValue / 100) * circumference

  useEffect(() => {
    if (circleRef.current && animate) {
      circleRef.current.style.transition = 'none'
      circleRef.current.style.strokeDashoffset = String(circumference)
      // Force reflow
      circleRef.current.getBoundingClientRect()
      circleRef.current.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)'
      circleRef.current.style.strokeDashoffset = String(offset)
    }
  }, [value, circumference, offset, animate])

  // Status color derivation
  const statusColor = value >= 80 ? '#10B981' : value >= 60 ? '#F59E0B' : '#EF4444'
  const displayColor = color === 'auto' ? statusColor : color

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--pz-surface-2)"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          <circle
            ref={circleRef}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={displayColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? circumference : offset}
            style={{
              filter: `drop-shadow(0 0 6px ${displayColor}40)`,
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--pz-text)] tabular-nums">{clampedValue}%</span>
        </div>
      </div>
      {label && (
        <span className="text-[10px] font-semibold text-[var(--pz-text-secondary)] text-center leading-tight max-w-[90px] truncate">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[9px] text-[var(--pz-text-muted)] text-center leading-tight">
          {sublabel}
        </span>
      )}
    </div>
  )
}
