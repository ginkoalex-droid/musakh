import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from 'react'
import { ru } from './ru'
import { en } from './en'
import { he } from './he'
import type { TranslationKey } from './ru'

export type Lang = 'ru' | 'en' | 'he'

const translations: Record<Lang, Record<TranslationKey, string>> = { ru, en, he }

export const langNames: Record<Lang, string> = {
  ru: 'РУС',
  en: 'ENG',
  he: 'עבר',
}

export const langDir: Record<Lang, 'ltr' | 'rtl'> = {
  ru: 'ltr',
  en: 'ltr',
  he: 'rtl',
}

interface I18nContext {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey) => string
  dir: 'ltr' | 'rtl'
}

const Ctx = createContext<I18nContext>({
  lang: 'ru',
  setLang: () => {},
  t: (k) => ru[k],
  dir: 'ltr',
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'ru'
  })

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  const dir = langDir[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const t = (key: TranslationKey) => translations[lang][key] ?? ru[key]

  return createElement(Ctx.Provider, { value: { lang, setLang, t, dir } }, children)
}

export function useT() {
  return useContext(Ctx)
}
