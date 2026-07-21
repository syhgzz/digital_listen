import { integerToWords } from './numberToWords'

const MONTHS: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const ORDINAL_DAYS: readonly string[] = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
  'twenty-second',
  'twenty-third',
  'twenty-fourth',
  'twenty-fifth',
  'twenty-sixth',
  'twenty-seventh',
  'twenty-eighth',
  'twenty-ninth',
  'thirtieth',
  'thirty-first',
]

const yearToWords = (year: number): string => {
  if (year < 1000) {
    return integerToWords(String(year))
  }

  const high = Math.floor(year / 100)
  const low = year % 100

  if (low === 0) {
    if (year % 1000 === 0) {
      return `${integerToWords(String(year / 1000))} thousand`
    }
    return `${integerToWords(String(high))} hundred`
  }

  if (high >= 10 && high % 10 === 0 && low < 10) {
    return `${integerToWords(String(high / 10))} thousand ${integerToWords(String(low))}`
  }

  if (low < 10) {
    return `${integerToWords(String(high))} oh ${integerToWords(String(low))}`
  }

  return `${integerToWords(String(high))} ${integerToWords(String(low))}`
}

export const dateToSpoken = (date: Date): string => {
  const month = MONTHS[date.getMonth()]
  const dayOrdinal = ORDINAL_DAYS[date.getDate()]
  const yearWords = yearToWords(date.getFullYear())
  return `${month} ${dayOrdinal}, ${yearWords}`
}
