// Each item references a key in messages/<locale>.json under "Nav".
// Translation happens at render time via useTranslations.
const headerNavLinks: { href: string; key: 'home' | 'blog' | 'tags' | 'tools' | 'projects' | 'about' }[] = [
  { href: '/', key: 'home' },
  { href: '/blog', key: 'blog' },
  { href: '/tags', key: 'tags' },
  { href: '/tools', key: 'tools' },
  // { href: '/projects', key: 'projects' }, // hidden until ready
  { href: '/about', key: 'about' },
]

export default headerNavLinks
