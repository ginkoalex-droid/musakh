import type { Lang } from '../i18n'

const UNIT_TRANSLATIONS: Record<string, Record<Lang, string>> = {
  'шт':    { ru: 'шт',   en: 'pcs',   he: 'יח\'' },
  'л':     { ru: 'л',    en: 'L',     he: 'ל' },
  'кг':    { ru: 'кг',   en: 'kg',    he: 'ק"ג' },
  'г':     { ru: 'г',    en: 'g',     he: 'ג' },
  'м':     { ru: 'м',    en: 'm',     he: 'מ' },
  'компл': { ru: 'компл',en: 'set',   he: 'ערכה' },
  'пара':  { ru: 'пара', en: 'pair',  he: 'זוג' },
  'набор': { ru: 'набор',en: 'kit',   he: 'ערכה' },
}

export function translateUnit(unit: string, lang: Lang): string {
  return UNIT_TRANSLATIONS[unit]?.[lang] ?? unit
}
