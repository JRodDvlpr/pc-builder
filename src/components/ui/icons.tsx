import type { SVGProps } from 'react'

/** Inline 24×24 stroke icons — no icon dependency, no network request. */
type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  cpu: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </Svg>
  ),
  board: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="6.5" y="6.5" width="6" height="6" rx="1" />
      <path d="M16 7h3M16 10h3M7 16h10M7 19h6" />
    </Svg>
  ),
  memory: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="7" width="20" height="10" rx="1.5" />
      <path d="M6 17v2M10 17v2M14 17v2M18 17v2M6 10.5v3M10 10.5v3M14 10.5v3M18 10.5v3" />
    </Svg>
  ),
  drive: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h6M7 12h4" />
      <circle cx="17" cy="15" r="1.25" />
    </Svg>
  ),
  gpu: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="6" width="20" height="11" rx="2" />
      <circle cx="8" cy="11.5" r="2.75" />
      <circle cx="16" cy="11.5" r="2.75" />
      <path d="M5 17v2M19 17v2" />
    </Svg>
  ),
  case: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <circle cx="12" cy="9" r="3.25" />
      <path d="M9 16h6M9 18.5h4" />
    </Svg>
  ),
  psu: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="9" cy="12" r="3.25" />
      <path d="M15.5 10h3.5M15.5 14h3.5" />
    </Svg>
  ),
  fan: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="12" cy="12" r="1.75" />
      <path d="M12 10.25c0-2.5-.9-4.25-2.75-4.25S6.75 8 8.5 9.5c1 .85 2.4 1.1 3.5.75M13.75 12c2.5 0 4.25-.9 4.25-2.75S16 6.75 14.5 8.5c-.85 1-1.1 2.4-.75 3.5M12 13.75c0 2.5.9 4.25 2.75 4.25S17.25 16 15.5 14.5c-1-.85-2.4-1.1-3.5-.75M10.25 12c-2.5 0-4.25.9-4.25 2.75S8 17.25 9.5 15.5c.85-1 1.1-2.4.75-3.5" />
    </Svg>
  ),
  monitor: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3.5" width="20" height="13" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  ),
  pencil: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="m14.5 5.5 4 4" />
    </Svg>
  ),
  undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
      <path d="m8 5-4 4 4 4" />
    </Svg>
  ),
  /** A part the user already owns: a box with a tick. */
  owned: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 8.5v8l-8 4.5-8-4.5v-8L12 4l8 4.5Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </Svg>
  ),
  info: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.75v.01" />
    </Svg>
  ),
  x: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Svg>
  ),
  swap: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5" />
    </Svg>
  ),
  sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </Svg>
  ),
  moon: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  ),
  chevron: (p: IconProps) => (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  ),
  link: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.5 1.5" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.5-1.5" />
    </Svg>
  ),
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </Svg>
  ),
  filter: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 5.5h18M6.5 12h11M10 18.5h4" />
    </Svg>
  ),
  refresh: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 5v6h-6" />
    </Svg>
  ),
}

export type IconName = keyof typeof Icons

export function Icon({ name, ...props }: { name: IconName } & IconProps) {
  const Cmp = Icons[name] ?? Icons.info
  return <Cmp {...props} />
}
