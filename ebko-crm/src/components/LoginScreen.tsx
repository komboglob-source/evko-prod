import { useState, type FormEvent } from 'react'
import type { LoginPayload } from '../types'

interface LoginScreenProps {
  onLogin: (payload: LoginPayload) => Promise<void>
  isLoading: boolean
  errorMessage: string | null
}

const quickAuth = [
  { label: 'Админ', login: 'admin', password: 'admin' },
  { label: 'Оператор КТП', login: 'ktp', password: 'ktp' },
  { label: 'Инженер WFM', login: 'wfm', password: 'wfm' },
  { label: 'Клиент', login: 'client', password: 'client' },
  { label: 'EBKO', login: 'ebko', password: 'ebko' },
]

export function LoginScreen({ onLogin, isLoading, errorMessage }: LoginScreenProps) {
  const [login, setLogin] = useState('admin')
  const [password, setPassword] = useState('admin')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await onLogin({ login, password })
  }

  return (
    <div className="login-layout">
      <div className="login-card">
        <div className="login-header">
          <p className="brand-caption">EBKO CRM</p>
          <h1>Вход в систему</h1>
          <p>Авторизация через `POST /api/v1/auth/login` с Basic Auth.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="login">
            Логин
          </label>
          <input
            id="login"
            className="text-input"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="username"
            placeholder="Введите логин"
            required
          />

          <label className="field-label" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            className="text-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Введите пароль"
            required
          />

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="quick-access-grid">
          {quickAuth.map((item) => (
            <button
              key={item.login}
              className="ghost-button"
              type="button"
              onClick={() => {
                setLogin(item.login)
                setPassword(item.password)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

