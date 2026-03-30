import { useEffect, useState } from 'react'
import { ROLE_LABELS } from '../constants'
import type { UserProfile } from '../types'
import { initials } from '../utils/format'
import { readImageAsDataUrl } from '../utils/image'
import { formatPhoneNumber } from '../utils/phone'

interface ProfileModuleProps {
  user: UserProfile
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>
}

export function ProfileModule({ user, onUpdateProfile }: ProfileModuleProps) {
  const [image, setImage] = useState(user.image)
  const [position, setPosition] = useState(user.position)
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber)
  const [email, setEmail] = useState(user.email)
  const [isSaving, setIsSaving] = useState(false)
  const canEditPosition = user.role !== 'ktp' && user.role !== 'wfm'

  useEffect(() => {
    setImage(user.image)
    setPosition(user.position)
    setPhoneNumber(user.phoneNumber)
    setEmail(user.email)
  }, [user])

  return (
    <section className="module-wrap">
      <h1>Настройки профиля</h1>

      <article className="details-screen">
        <div className="profile-summary">
          {image ? (
            <img className="avatar-photo" src={image} alt={user.fullName} />
          ) : (
            <div className="profile-avatar large">{initials(user.fullName)}</div>
          )}

          <div>
            <p>
              <strong>ФИО:</strong> {user.fullName}
            </p>
            <p>
              <strong>Роль:</strong> {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>

        <form
          className="inline-form compact"
          onSubmit={(event) => {
            event.preventDefault()
            setIsSaving(true)

            void onUpdateProfile({
              image,
              ...(canEditPosition ? { position } : {}),
              phoneNumber,
              email,
            })
              .catch((error: unknown) => {
                window.alert(
                  error instanceof Error
                    ? error.message
                    : 'Не удалось сохранить изменения профиля.',
                )
              })
              .finally(() => {
                setIsSaving(false)
              })
          }}
        >
          <div className="form-grid">
            <label>
              Должность
              <input
                className="text-input"
                value={position}
                disabled={!canEditPosition}
                onChange={(event) => setPosition(event.target.value)}
              />
              {!canEditPosition ? (
                <small className="field-hint">
                  {'\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u044b \u041a\u0422\u041f \u0438 WFM \u043d\u0435 \u043c\u043e\u0433\u0443\u0442 \u043c\u0435\u043d\u044f\u0442\u044c \u0441\u0432\u043e\u044e \u0434\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c.'}
                </small>
              ) : null}
            </label>

            <label>
              Телефон
              <input
                className="text-input"
                type="tel"
                inputMode="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(formatPhoneNumber(event.target.value))}
              />
            </label>

            <label>
              Email
              <input
                className="text-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              Фото
              <input
                className="text-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const imageFile = event.target.files?.[0]
                  if (!imageFile) {
                    return
                  }

                  void readImageAsDataUrl(imageFile)
                    .then((nextImage) => {
                      setImage(nextImage)
                    })
                    .catch((error: unknown) => {
                      window.alert(
                        error instanceof Error
                          ? error.message
                          : 'Не удалось загрузить изображение.',
                      )
                    })
                }}
              />
            </label>
          </div>

          {image ? (
            <button type="button" className="ghost-button button-sm" onClick={() => setImage('')}>
              Удалить фото
            </button>
          ) : null}

          <button type="submit" className="primary-button button-sm" disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить профиль'}
          </button>
        </form>
      </article>
    </section>
  )
}
