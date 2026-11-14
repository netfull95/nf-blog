import Link from '@/components/Link'
import Image from '@/components/Image'
import { getTranslations } from 'next-intl/server'

export default async function Hero({ avatar }: { avatar?: string }) {
  const t = await getTranslations('Home.hero')
  const skills = t.raw('skills') as string[]
  return (
    <section className="flex flex-col-reverse gap-8 pt-10 pb-12 md:flex-row md:items-center md:justify-between">
      <div className="max-w-2xl space-y-5">
        <p className="text-primary-600 dark:text-primary-400 text-sm font-semibold tracking-wide uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
          {t('greeting')}
        </h1>
        <p className="text-lg leading-8 text-gray-600 dark:text-gray-300">{t('intro')}</p>
        <ul className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <li
              key={skill}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
            >
              {skill}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/blog"
            className="bg-primary-600 hover:bg-primary-700 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t('ctaPrimary')}
          </Link>
          <Link
            href="/about"
            className="hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </div>
      {avatar && (
        <Image
          src={avatar}
          alt={t('avatarAlt')}
          width={176}
          height={176}
          priority
          className="ring-primary-500/30 h-32 w-32 shrink-0 rounded-full object-cover ring-4 md:h-44 md:w-44"
        />
      )}
    </section>
  )
}
