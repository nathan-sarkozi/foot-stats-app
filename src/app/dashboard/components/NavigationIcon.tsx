export type NavigationIconName = 'grid' | 'award' | 'chart' | 'target' | 'calendar' | 'route' | 'users' | 'profile' | 'settings' | 'plus' | 'more' | 'close' | 'chevron' | 'logout'

export default function NavigationIcon({ name, size = 20 }: { name: NavigationIconName; size?: number }) {
  const shapes = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    award: <><circle cx="12" cy="8" r="5" /><path d="m8.5 12-1 9 4.5-3 4.5 3-1-9M10 8h4m-2-2v4" /></>,
    chart: <><path d="M4 4v16h17M7 14l4-5 4 3 5-7M16 5h4v4" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3" /></>,
    route: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M6 7v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7M15 7l3-3 3 3" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    settings: <><path d="m9 3-.6 3-2 .9-2.7-1-2 3.5L4 12l-2.3 2.6 2 3.5 2.7-1 2 .9.6 3h4l.6-3 2-.9 2.7 1 2-3.5L18 12l2.3-2.6-2-3.5-2.7 1-2-.9L13 3Z" /><circle cx="11" cy="12" r="3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    logout: <path d="M9 4H4v16h5m6-12 4 4-4 4m-7-4h11" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}
