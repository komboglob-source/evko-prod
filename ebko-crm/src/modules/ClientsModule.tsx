import { useMemo, useState, type FormEvent } from 'react'
import type { ClientCompany, ClientRepresentative, UserProfile } from '../types'
import { canManageRepresentatives, canViewRepresentative } from '../utils/permissions'
import { CustomSelect } from '../components/CustomSelect'

interface ClientsModuleProps {
  user: UserProfile
  clients: ClientCompany[]
  selectedRecordKey?: string | null
  onSelectRecord?: (recordKey: string | null) => void
  onUpsertRepresentative: (
    customerId: string,
    representative: ClientRepresentative,
  ) => Promise<void>
  onDeleteRepresentative: (customerId: string, representativeId: string) => Promise<void>
}

interface RepresentativeRecord {
  customerId: string
  customerName: string
  customerAddress: string
  representative: ClientRepresentative
}

interface RepresentativeDraft {
  customerId: string
  representative: ClientRepresentative
}

function nextRepresentativeId(clients: ClientCompany[]): string {
  const allRepresentatives = clients.flatMap((client) => client.representatives)
  const max = allRepresentatives
    .map((representative) => Number(representative.accountId.split('-').at(-1) ?? 0))
    .reduce((left, right) => Math.max(left, right), 0)

  return `acc-rep-${max + 1}`
}

function createEmptyRepresentative(clients: ClientCompany[], customerId: string): ClientRepresentative {
  return {
    accountId: nextRepresentativeId(clients),
    clientId: customerId,
    fullName: '',
    image: '',
    birthDate: '',
    position: '',
    phoneNumber: '',
    email: '',
    login: '',
    passwordHash: '',
    role: 'client',
  }
}

function recordKey(customerId: string, representativeId: string): string {
  return `${customerId}:${representativeId}`
}

export function ClientsModule({
  user,
  clients,
  selectedRecordKey: controlledSelectedRecordKey,
  onSelectRecord,
  onUpsertRepresentative,
  onDeleteRepresentative,
}: ClientsModuleProps) {
  const [localSelectedRecordKey, setLocalSelectedRecordKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<RepresentativeDraft | null>(null)
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [fullNameFilter, setFullNameFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [loginFilter, setLoginFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [phoneFilter, setPhoneFilter] = useState('')
  const [birthDateFrom, setBirthDateFrom] = useState('')
  const [birthDateTo, setBirthDateTo] = useState('')

  const selectedRecordKey = controlledSelectedRecordKey ?? localSelectedRecordKey

  function selectRecord(nextRecordKey: string | null): void {
    onSelectRecord?.(nextRecordKey)
    if (controlledSelectedRecordKey === undefined) {
      setLocalSelectedRecordKey(nextRecordKey)
    }
  }

  const canManage = canManageRepresentatives(user)

  const visibleRecords = useMemo<RepresentativeRecord[]>(
    () =>
      clients
        .filter((client) => canViewRepresentative(user, client.id))
        .flatMap((client) =>
          client.representatives.map((representative) => ({
            customerId: client.id,
            customerName: client.name,
            customerAddress: client.address,
            representative,
          })),
        )
        .sort((left, right) =>
          left.representative.fullName.localeCompare(right.representative.fullName, 'ru-RU'),
        ),
    [clients, user],
  )

  const filteredRecords = useMemo(() => {
    return visibleRecords.filter((record) => {
      const normalized = search.trim().toLowerCase()
      const normalizedFullName = fullNameFilter.trim().toLowerCase()
      const normalizedPosition = positionFilter.trim().toLowerCase()
      const normalizedLogin = loginFilter.trim().toLowerCase()
      const normalizedEmail = emailFilter.trim().toLowerCase()
      const normalizedPhone = phoneFilter.trim().toLowerCase()
      const { representative } = record
      const matchesSearch =
        !normalized ||
        `${representative.fullName} ${representative.position} ${representative.phoneNumber} ${representative.email} ${representative.login} ${record.customerName} ${record.customerAddress}`
          .toLowerCase()
          .includes(normalized)
      const matchesCustomer = !customerFilter || record.customerId === customerFilter
      const matchesFullName =
        !normalizedFullName || representative.fullName.toLowerCase().includes(normalizedFullName)
      const matchesPosition =
        !normalizedPosition || representative.position.toLowerCase().includes(normalizedPosition)
      const matchesLogin =
        !normalizedLogin || representative.login.toLowerCase().includes(normalizedLogin)
      const matchesEmail =
        !normalizedEmail || representative.email.toLowerCase().includes(normalizedEmail)
      const matchesPhone =
        !normalizedPhone || representative.phoneNumber.toLowerCase().includes(normalizedPhone)
      const matchesBirthDateFrom =
        !birthDateFrom || Boolean(representative.birthDate && representative.birthDate >= birthDateFrom)
      const matchesBirthDateTo =
        !birthDateTo || Boolean(representative.birthDate && representative.birthDate <= birthDateTo)

      return (
        matchesSearch &&
        matchesCustomer &&
        matchesFullName &&
        matchesPosition &&
        matchesLogin &&
        matchesEmail &&
        matchesPhone &&
        matchesBirthDateFrom &&
        matchesBirthDateTo
      )
    })
  }, [
    birthDateFrom,
    birthDateTo,
    customerFilter,
    emailFilter,
    fullNameFilter,
    loginFilter,
    phoneFilter,
    positionFilter,
    search,
    visibleRecords,
  ])

  const selectedRecord =
    (selectedRecordKey
      ? visibleRecords.find(
          (record) =>
            recordKey(record.customerId, record.representative.accountId) === selectedRecordKey,
        )
      : null) ?? null

  async function saveDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!draft) {
      return
    }

    const safeRepresentative = {
      ...draft.representative,
      clientId: draft.customerId,
    }

    await onUpsertRepresentative(draft.customerId, safeRepresentative)
    selectRecord(recordKey(draft.customerId, safeRepresentative.accountId))
    setDraft(null)
  }

  if (!draft && !selectedRecord && visibleRecords.length === 0) {
    return (
      <section className="module-wrap">
        <h1>Клиенты</h1>
        <p className="empty-state">Для текущей роли нет доступных представителей.</p>
      </section>
    )
  }

  return (
    <section className="module-wrap">
      <div className="module-title-row">
        <h1>Клиенты</h1>
        {canManage && !draft && !selectedRecord ? (
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              const customerId = clients[0]?.id ?? ''
              setDraft({
                customerId,
                representative: createEmptyRepresentative(clients, customerId),
              })
              selectRecord(null)
            }}
            disabled={clients.length === 0}
          >
            Добавить представителя
          </button>
        ) : null}
      </div>

      {!draft && !selectedRecord ? (
        <div className="form-grid">
          <label>
            Общий поиск
            <input
              className="text-input"
              placeholder="По ФИО, компании, адресу, контактам или логину"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            Компания
            <CustomSelect
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              options={[
                { value: '', label: 'Все компании' },
                ...clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
              placeholder={null}
              showPlaceholder={false}
            />
          </label>

          <label>
            ФИО
            <input
              className="text-input"
              value={fullNameFilter}
              onChange={(event) => setFullNameFilter(event.target.value)}
              placeholder="По ФИО"
            />
          </label>

          <label>
            Должность
            <input
              className="text-input"
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value)}
              placeholder="По должности"
            />
          </label>

          <label>
            Логин
            <input
              className="text-input"
              value={loginFilter}
              onChange={(event) => setLoginFilter(event.target.value)}
              placeholder="По логину"
            />
          </label>

          <label>
            Email
            <input
              className="text-input"
              value={emailFilter}
              onChange={(event) => setEmailFilter(event.target.value)}
              placeholder="По email"
            />
          </label>

          <label>
            Телефон
            <input
              className="text-input"
              value={phoneFilter}
              onChange={(event) => setPhoneFilter(event.target.value)}
              placeholder="По телефону"
            />
          </label>

          <label>
            Дата рождения с
            <input
              className="text-input"
              type="date"
              value={birthDateFrom}
              onChange={(event) => setBirthDateFrom(event.target.value)}
            />
          </label>

          <label>
            Дата рождения по
            <input
              className="text-input"
              type="date"
              value={birthDateTo}
              onChange={(event) => setBirthDateTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {draft ? (
        <form className="inline-form" onSubmit={saveDraft}>
          <h3>{selectedRecord ? 'Редактирование представителя' : 'Новый представитель'}</h3>

          <div className="form-grid">
            <label>
              Компания
              <CustomSelect
                value={draft.customerId}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          customerId: event.target.value,
                          representative: {
                            ...previous.representative,
                            clientId: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                }))}
                placeholder={null}
                showPlaceholder={false}
                required
              />
            </label>

            <label>
              ФИО
              <input
                className="text-input"
                value={draft.representative.fullName}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            fullName: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Телефон
              <input
                className="text-input"
                value={draft.representative.phoneNumber}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            phoneNumber: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Дата рождения
              <input
                className="text-input"
                type="date"
                value={draft.representative.birthDate}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            birthDate: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
              />
            </label>

            <label>
              Должность
              <input
                className="text-input"
                value={draft.representative.position}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            position: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                placeholder="Например, менеджер по эксплуатации"
              />
            </label>

            <label>
              Email
              <input
                className="text-input"
                type="email"
                value={draft.representative.email}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            email: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Логин
              <input
                className="text-input"
                value={draft.representative.login}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            login: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Пароль
              <input
                className="text-input"
                value={draft.representative.passwordHash}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          representative: {
                            ...previous.representative,
                            passwordHash: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                placeholder={selectedRecord ? 'Оставьте пустым, чтобы не менять' : 'Введите пароль'}
                required={!selectedRecord}
              />
            </label>
          </div>

          <div className="section-head-row">
            <button type="submit" className="primary-button button-sm">
              Сохранить
            </button>
            <button type="button" className="ghost-button button-sm" onClick={() => setDraft(null)}>
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      {selectedRecord ? (
        <article className="details-screen">
          <div className="module-title-row">
            <h2>{selectedRecord.representative.fullName}</h2>
            <button
              type="button"
              className="ghost-button button-sm"
              onClick={() => selectRecord(null)}
            >
              К списку
            </button>
          </div>

          <div className="data-columns">
            <div>
              <p>
                <strong>Компания:</strong> {selectedRecord.customerName}
              </p>
              <p>
                <strong>Адрес компании:</strong> {selectedRecord.customerAddress}
              </p>
              <p>
                <strong>Телефон:</strong> {selectedRecord.representative.phoneNumber}
              </p>
              <p>
                <strong>Email:</strong> {selectedRecord.representative.email}
              </p>
              <p>
                <strong>Должность:</strong> {selectedRecord.representative.position || 'Не задана'}
              </p>
              <p>
                <strong>Дата рождения:</strong> {selectedRecord.representative.birthDate || 'Не задана'}
              </p>
              <p>
                <strong>Логин:</strong> {selectedRecord.representative.login}
              </p>
            </div>
          </div>

          {canManage ? (
            <div className="section-head-row">
              <button
                type="button"
                className="primary-button button-sm"
                onClick={() =>
                  setDraft({
                    customerId: selectedRecord.customerId,
                    representative: selectedRecord.representative,
                  })
                }
              >
                Редактировать
              </button>
              <button
                type="button"
                className="danger-button button-sm"
                onClick={() => {
                   void onDeleteRepresentative(
                     selectedRecord.customerId,
                     selectedRecord.representative.accountId,
                   )
                   selectRecord(null)
                 }}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="cards-column">
          {filteredRecords.map((record) => (
            <button
              type="button"
                key={recordKey(record.customerId, record.representative.accountId)}
                className="appeal-card"
                onClick={() => selectRecord(recordKey(record.customerId, record.representative.accountId))}
              >
              <div className="card-row">
                <strong>{record.representative.fullName}</strong>
                <span>{record.customerName}</span>
              </div>
              <p>{record.representative.position || 'Должность не указана'}</p>
              <p>{record.representative.phoneNumber}</p>
              <p>{record.representative.email}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
