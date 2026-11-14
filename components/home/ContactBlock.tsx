import SocialIcon from '@/components/social-icons'
import siteMetadata from '@/data/siteMetadata'
import { getTranslations } from 'next-intl/server'

export default async function ContactBlock({
  email,
  linkedin,
}: {
  email?: string
  linkedin?: string
}) {
  const t = await getTranslations('Home.contact')
  return (
    <section className="my-10 rounded-2xl bg-gray-50 p-6 md:p-8 dark:bg-gray-900">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {t('title')}
      </h2>
      <p className="mt-2 max-w-2xl leading-7 text-gray-600 dark:text-gray-300">
        {t('description')}
      </p>
      {email && (
        <a
          href={`mailto:${email}`}
          className="text-primary-600 dark:text-primary-400 mt-4 inline-block text-lg font-semibold hover:underline"
        >
          {email}
        </a>
      )}
      <div className="mt-4 flex space-x-4">
        <SocialIcon kind="linkedin" href={linkedin} size={6} />
        <SocialIcon kind="github" href={siteMetadata.github} size={6} />
        <SocialIcon kind="facebook" href={siteMetadata.facebook} size={6} />
        <SocialIcon kind="youtube" href={siteMetadata.youtube} size={6} />
      </div>
    </section>
  )
}
