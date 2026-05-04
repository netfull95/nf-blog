// Registry of available tools. Adding a new tool: add an entry here and create
// the corresponding page under app/[locale]/tools/<slug>/page.tsx.
export type ToolDefinition = {
  slug: string
  // i18n key under "Tools" namespace, e.g. "qr" -> Tools.qr.title / Tools.qr.shortDescription
  i18nKey: string
  icon: string // emoji for now; can swap to an icon component later
}

export const tools: ToolDefinition[] = [
  { slug: 'qr-generator', i18nKey: 'qr', icon: '🔳' },
  { slug: 'fb-info', i18nKey: 'fb', icon: '🆔' },
  { slug: 'shopee-shortlink', i18nKey: 'shopee', icon: '🛒' },
]
