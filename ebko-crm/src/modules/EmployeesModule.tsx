import { useMemo, useState, type FormEvent } from 'react'
import { ROLE_LABELS } from '../constants'
import { CustomSelect } from '../components/CustomSelect'
import type { Employee, UserProfile } from '../types'
import { initials } from '../utils/format'
import { canManageEmployees } from '../utils/permissions'

interface EmployeesModuleProps {
  user: UserProfile
  employees: Employee[]
  selectedEmployeeId?: string | null
  onSelectEmployee?: (employeeId: string | null) => void
  onUpsertEmployee: (employee: Employee) => Promise<void>
  onDeleteEmployee: (employeeId: string) => Promise<void>
}

function nextEmployeeId(employees: Employee[]): string {
  const max = employees
    .map((employee) => Number(employee.accountId.split('-').at(-1) ?? 0))
    .reduce((left, right) => Math.max(left, right), 0)

  return `acc-emp-generated-${max + 1}`
}

function defaultEmployee(employees: Employee[]): Employee {
  return {
    accountId: nextEmployeeId(employees),
    fullName: '',
    image: '',
    birthDate: '1998-01-01',
    position: '',
    phoneNumber: '',
    email: '',
    role: 'ktp',
    login: '',
    passwordHash: '',
    hireDate: new Date().toISOString().slice(0, 10),
  }
}

function readImageAsDataUrl(file: File): Promise<string> {
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

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) {
    return 0
  }

  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1
  }

  return age
}

export function EmployeesModule({
  user,
  employees,
  selectedEmployeeId: controlledSelectedEmployeeId,
  onSelectEmployee,
  onUpsertEmployee,
  onDeleteEmployee,
}: EmployeesModuleProps) {
  const [localSelectedEmployeeId, setLocalSelectedEmployeeId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Employee | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Employee['role'] | ''>('')
  const [fullNameFilter, setFullNameFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [loginFilter, setLoginFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [phoneFilter, setPhoneFilter] = useState('')
  const [birthDateFrom, setBirthDateFrom] = useState('')
  const [birthDateTo, setBirthDateTo] = useState('')
  const [hireDateFrom, setHireDateFrom] = useState('')
  const [hireDateTo, setHireDateTo] = useState('')

  const selectedEmployeeId = controlledSelectedEmployeeId ?? localSelectedEmployeeId

  function selectEmployee(employeeId: string | null): void {
    onSelectEmployee?.(employeeId)
    if (controlledSelectedEmployeeId === undefined) {
      setLocalSelectedEmployeeId(employeeId)
    }
  }

  const isAdmin = canManageEmployees(user)

  const sortedEmployees = useMemo(
    () =>
      employees
        .slice()
        .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru-RU')),
    [employees],
  )

  const filteredEmployees = useMemo(() => {
    return sortedEmployees.filter((employee) => {
      const normalizedSearch = search.trim().toLowerCase()
      const normalizedFullName = fullNameFilter.trim().toLowerCase()
      const normalizedPosition = positionFilter.trim().toLowerCase()
      const normalizedLogin = loginFilter.trim().toLowerCase()
      const normalizedEmail = emailFilter.trim().toLowerCase()
      const normalizedPhone = phoneFilter.trim().toLowerCase()

      const matchesSearch =
        !normalizedSearch ||
        `${employee.fullName} ${employee.position} ${employee.phoneNumber} ${employee.email}`
          .toLowerCase()
          .includes(normalizedSearch)
      const matchesRole = !roleFilter || employee.role === roleFilter
      const matchesFullName =
        !normalizedFullName || employee.fullName.toLowerCase().includes(normalizedFullName)
      const matchesPosition =
        !normalizedPosition || employee.position.toLowerCase().includes(normalizedPosition)
      const matchesLogin =
        !normalizedLogin || employee.login.toLowerCase().includes(normalizedLogin)
      const matchesEmail =
        !normalizedEmail || employee.email.toLowerCase().includes(normalizedEmail)
      const matchesPhone =
        !normalizedPhone || employee.phoneNumber.toLowerCase().includes(normalizedPhone)
      const matchesBirthDateFrom =
        !birthDateFrom || Boolean(employee.birthDate && employee.birthDate >= birthDateFrom)
      const matchesBirthDateTo =
        !birthDateTo || Boolean(employee.birthDate && employee.birthDate <= birthDateTo)
      const matchesHireDateFrom =
        !hireDateFrom || Boolean(employee.hireDate && employee.hireDate >= hireDateFrom)
      const matchesHireDateTo =
        !hireDateTo || Boolean(employee.hireDate && employee.hireDate <= hireDateTo)

      return (
        matchesSearch &&
        matchesRole &&
        matchesFullName &&
        matchesPosition &&
        matchesLogin &&
        matchesEmail &&
        matchesPhone &&
        matchesBirthDateFrom &&
        matchesBirthDateTo &&
        matchesHireDateFrom &&
        matchesHireDateTo
      )
    })
  }, [
    birthDateFrom,
    birthDateTo,
    emailFilter,
    fullNameFilter,
    hireDateFrom,
    hireDateTo,
    loginFilter,
    phoneFilter,
    positionFilter,
    roleFilter,
    search,
    sortedEmployees,
  ])

  const selectedEmployee =
    (selectedEmployeeId
      ? sortedEmployees.find((employee) => employee.accountId === selectedEmployeeId)
      : null) ??
    null

  if (user.role === 'client') {
    return (
      <section className="module-wrap">
        <h1>Сотрудники</h1>
        <p className="empty-state">У роли Клиент нет доступа к модулю сотрудников.</p>
      </section>
    )
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!draft) {
      return
    }

    await onUpsertEmployee(draft)
    selectEmployee(draft.accountId)
    setDraft(null)
  }

  return (
    <section className="module-wrap">
      <div className="module-title-row">
        <h1>Сотрудники</h1>
        {isAdmin && !selectedEmployee && !draft ? (
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              setDraft(defaultEmployee(sortedEmployees))
              selectEmployee(null)
            }}
          >
            Добавить сотрудника
          </button>
        ) : null}
      </div>

      {!selectedEmployee && !draft ? (
        <div className="form-grid">
          <label>
            Общий поиск
            <input
              className="text-input"
              placeholder="По ФИО, должности, телефону или email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            Роль
            <CustomSelect
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as Employee['role'] | '')}
              options={[
                { value: '', label: 'Все роли' },
                { value: 'admin', label: 'Админ' },
                { value: 'ktp', label: 'Оператор КТП' },
                { value: 'wfm', label: 'Инженер WFM' },
                { value: 'ebko', label: 'EBKO' },
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

          <label>
            Дата приема с
            <input
              className="text-input"
              type="date"
              value={hireDateFrom}
              onChange={(event) => setHireDateFrom(event.target.value)}
            />
          </label>

          <label>
            Дата приема по
            <input
              className="text-input"
              type="date"
              value={hireDateTo}
              onChange={(event) => setHireDateTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {draft ? (
        <form className="inline-form" onSubmit={saveDraft}>
          <h3>{selectedEmployee ? 'Редактирование сотрудника' : 'Новый сотрудник'}</h3>

          <div className="form-grid">
            <label>
              ФИО
              <input
                className="text-input"
                value={draft.fullName}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          fullName: event.target.value,
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
                value={draft.birthDate}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          birthDate: event.target.value,
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Дата приема
              <input
                className="text-input"
                type="date"
                value={draft.hireDate}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          hireDate: event.target.value,
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Должность
              <input
                className="text-input"
                value={draft.position}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          position: event.target.value,
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
                value={draft.phoneNumber}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          phoneNumber: event.target.value,
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Email
              <input
                className="text-input"
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          email: event.target.value,
                        }
                      : previous,
                  )
                }
                required
              />
            </label>

            <label>
              Роль
              <CustomSelect
                value={draft.role}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          role: event.target.value as Employee['role'],
                        }
                      : previous,
                  )
                }
                options={[
                  { value: 'admin', label: 'Админ' },
                  { value: 'ktp', label: 'Оператор КТП' },
                  { value: 'wfm', label: 'Инженер WFM' },
                  { value: 'ebko', label: 'EBKO' },
                ]}
                placeholder={null}
                showPlaceholder={false}
              />
            </label>

            <label>
              Логин
              <input
                className="text-input"
                value={draft.login}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          login: event.target.value,
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
                value={draft.passwordHash}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          passwordHash: event.target.value,
                        }
                      : previous,
                  )
                }
                placeholder={selectedEmployee ? 'Оставьте пустым, чтобы не менять' : 'Введите пароль'}
                required={!selectedEmployee}
              />
            </label>

            <label>
              Фото (URL)
              <input
                className="text-input"
                value={draft.image}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          image: event.target.value,
                        }
                      : previous,
                  )
                }
                placeholder="https://..."
              />
            </label>

            <label>
              Фото (файл)
              <input
                className="text-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const imageFile = event.target.files?.[0]
                  if (!imageFile) {
                    return
                  }

                  void readImageAsDataUrl(imageFile).then((image) => {
                    setDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            image,
                          }
                        : previous,
                    )
                  })
                }}
              />
            </label>
          </div>

          {draft.image ? (
            <div className="photo-preview-wrap">
              <img className="avatar-photo" src={draft.image} alt="Предпросмотр фото сотрудника" />
            </div>
          ) : null}

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

      {selectedEmployee ? (
        <article className="details-screen">
          <div className="module-title-row">
            <h2>{selectedEmployee.fullName}</h2>
            <button
              type="button"
              className="ghost-button button-sm"
              onClick={() => selectEmployee(null)}
            >
              К списку
            </button>
          </div>

          <div className="profile-summary">
            {selectedEmployee.image ? (
              <img className="avatar-photo" src={selectedEmployee.image} alt={selectedEmployee.fullName} />
            ) : (
              <div className="profile-avatar large">{initials(selectedEmployee.fullName)}</div>
            )}
            <div>
              <p>
                <strong>Должность:</strong> {selectedEmployee.position}
              </p>
              <p>
                <strong>Возраст:</strong> {calculateAge(selectedEmployee.birthDate)}
              </p>
              <p>
                <strong>Дата приема:</strong> {selectedEmployee.hireDate}
              </p>
              <p>
                <strong>Телефон:</strong> {selectedEmployee.phoneNumber}
              </p>
              <p>
                <strong>Email:</strong> {selectedEmployee.email}
              </p>
              <p>
                <strong>Роль:</strong> {ROLE_LABELS[selectedEmployee.role]}
              </p>
              <p>
                <strong>Логин:</strong> {selectedEmployee.login}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="section-head-row">
              <button
                type="button"
                className="primary-button button-sm"
                onClick={() => setDraft(selectedEmployee)}
              >
                Редактировать
              </button>
              <button
                type="button"
                className="danger-button button-sm"
                onClick={() => {
                  void onDeleteEmployee(selectedEmployee.accountId)
                  selectEmployee(null)
                }}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="tile-grid">
          {filteredEmployees.map((employee) => (
            <button
              type="button"
              key={employee.accountId}
              className="employee-tile"
              onClick={() => selectEmployee(employee.accountId)}
            >
              {employee.image ? (
                <img className="avatar-photo" src={employee.image} alt={employee.fullName} />
              ) : (
                <div className="profile-avatar">{initials(employee.fullName)}</div>
              )}
              <strong>{employee.fullName}</strong>
              <p>{employee.position}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
