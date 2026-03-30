const allowedImageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
])

const MAX_IMAGE_BYTES = 512 * 1024
const MAX_IMAGE_DIMENSION = 1024
const COMPRESSED_IMAGE_MIME_TYPE = 'image/jpeg'
const COMPRESSED_IMAGE_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42]

function validateImageFile(file: File): void {
  const lowerName = file.name.toLowerCase()
  const hasAllowedExtension = allowedImageExtensions.some((extension) => lowerName.endsWith(extension))
  if (!hasAllowedExtension) {
    throw new Error('Допустимы только изображения PNG, JPG, JPEG, GIF, WEBP или BMP.')
  }

  if (file.type && !allowedImageMimeTypes.has(file.type.toLowerCase())) {
    throw new Error('Выбранный файл не является поддерживаемым изображением.')
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Ошибка чтения изображения'))
    }

    reader.onerror = () => reject(new Error('Ошибка чтения изображения'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Не удалось обработать изображение'))
    }

    image.src = objectUrl
  })
}

function getDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    return 0
  }

  const payload = dataUrl.slice(commaIndex + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

function drawCompressedImage(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Не удалось обработать изображение')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas
}

async function compressImage(image: HTMLImageElement): Promise<string> {
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(1, image.naturalWidth),
    MAX_IMAGE_DIMENSION / Math.max(1, image.naturalHeight),
  )

  let width = Math.max(1, Math.round(image.naturalWidth * scale))
  let height = Math.max(1, Math.round(image.naturalHeight * scale))

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = drawCompressedImage(image, width, height)

    for (const quality of COMPRESSED_IMAGE_QUALITIES) {
      const dataUrl = canvas.toDataURL(COMPRESSED_IMAGE_MIME_TYPE, quality)
      if (getDataUrlByteLength(dataUrl) <= MAX_IMAGE_BYTES) {
        return dataUrl
      }
    }

    width = Math.max(1, Math.round(width * 0.82))
    height = Math.max(1, Math.round(height * 0.82))
  }

  throw new Error('Не удалось ужать изображение до допустимого размера 512 KB.')
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  validateImageFile(file)

  const image = await loadImageElement(file)
  const exceedsDimensions =
    image.naturalWidth > MAX_IMAGE_DIMENSION || image.naturalHeight > MAX_IMAGE_DIMENSION

  if (!exceedsDimensions && file.size <= MAX_IMAGE_BYTES) {
    return readFileAsDataUrl(file)
  }

  return compressImage(image)
}
