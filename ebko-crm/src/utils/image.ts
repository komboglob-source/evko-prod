const allowedImageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
])

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

export function readImageAsDataUrl(file: File): Promise<string> {
  validateImageFile(file)

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
