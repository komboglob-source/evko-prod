export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) {
    return ''
  }

  let normalized = digits
  if (normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`
  } else if (!normalized.startsWith('7')) {
    normalized = `7${normalized.slice(-10)}`
  }

  normalized = normalized.slice(0, 11)

  if (normalized === '7') {
    return '+7'
  }

  const local = normalized.slice(1)
  const areaCode = local.slice(0, 3)
  const firstBlock = local.slice(3, 6)
  const secondBlock = local.slice(6, 8)
  const thirdBlock = local.slice(8, 10)

  let formatted = '+7'
  if (areaCode) {
    formatted += ` (${areaCode}`
  }
  if (areaCode.length === 3) {
    formatted += ')'
  }
  if (firstBlock) {
    formatted += ` ${firstBlock}`
  }
  if (secondBlock) {
    formatted += `-${secondBlock}`
  }
  if (thirdBlock) {
    formatted += `-${thirdBlock}`
  }

  return formatted
}
