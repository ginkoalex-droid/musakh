import { useT } from '../i18n'
import { translateUnit } from './units'

export function useUnit() {
  const { lang } = useT()
  return (unit: string) => translateUnit(unit, lang)
}
