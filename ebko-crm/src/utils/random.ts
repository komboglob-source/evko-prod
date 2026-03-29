function fallbackRandomHex(length: number): string {
  let value = ''

  while (value.length < length) {
    value += Math.floor(Math.random() * 16).toString(16)
  }

  return value.slice(0, length)
}

export function createRandomId(): string {
  const cryptoApi = globalThis.crypto

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))

    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))

    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-')
  }

  return [
    Date.now().toString(16),
    fallbackRandomHex(8),
    fallbackRandomHex(4),
    fallbackRandomHex(4),
    fallbackRandomHex(12),
  ].join('-')
}

export function createRandomTokenFragment(): string {
  return createRandomId().replaceAll('-', '')
}
