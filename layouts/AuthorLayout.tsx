import { ReactNode } from 'react'
import type { Authors } from 'contentlayer/generated'
import Image from '@/components/Image'

interface Props {
  children: ReactNode
  content: Omit<Authors, '_id' | '_raw' | 'body'>
  locale: string
  title: string
}

export default function AuthorLayout({ children, content, locale, title }: Props) {
  const { name, avatar, occupation, company, email, linkedin, github } = content
  const isVietnamese = locale === 'vi'
  const companyName = isVietnamese ? 'Công ty TNHH Pancake Việt Nam' : company

  return (
    <div className="space-y-12">
      <header className="grid gap-8 rounded-3xl border border-gray-200 bg-gray-50 p-6 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center md:p-10 dark:border-gray-700 dark:bg-gray-900">
        {avatar && (
          <Image
            src={avatar}
            alt={name}
            width={192}
            height={192}
            className="mx-auto h-40 w-40 rounded-full object-cover ring-4 ring-white md:h-48 md:w-48 dark:ring-gray-800"
          />
        )}
        <div>
          <p className="text-primary-700 dark:text-primary-300 text-sm font-semibold tracking-wide uppercase">
            {occupation} · {isVietnamese ? 'Chủ trì dự án tích hợp' : 'Integration Project Lead'}
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
            {title}
          </h1>
          <p className="mt-3 text-lg leading-8 text-gray-700 dark:text-gray-300">
            {isVietnamese
              ? 'Mình kết nối nhu cầu kinh doanh, đối tác nền tảng và đội ngũ kỹ thuật để đưa các tích hợp vào vận hành, rồi tiếp tục phát triển chúng theo nhu cầu thực tế.'
              : 'I connect business needs, platform partners, and engineering teams to bring integrations into operation and evolve them as real needs change.'}
          </p>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {name} · {companyName}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`mailto:${email}`}
              className="bg-primary-600 hover:bg-primary-700 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              {isVietnamese ? 'Liên hệ trao đổi' : 'Get in touch'}
            </a>
            {linkedin && (
              <a
                href={linkedin}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-white dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                LinkedIn
              </a>
            )}
            {github && (
              <a
                href={github}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-white dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                GitHub
              </a>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
