import { useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  ClientCompany,
  EquipmentType,
  EquipmentUnit,
  ProductCatalogItem,
  Site,
  UserProfile,
} from '../types'
import { CustomSelect } from '../components/CustomSelect'
import { canEditEquipment, canViewEquipment } from '../utils/permissions'

interface EquipmentModuleProps {
  user: UserProfile
  equipment: EquipmentUnit[]
  sites: Site[]
  clients: ClientCompany[]
  equipmentTypes: EquipmentType[]
  products: ProductCatalogItem[]
  onUpsertEquipment: (equipment: EquipmentUnit) => Promise<void>
  onDeleteEquipment: (equipmentId: string) => Promise<void>
}

function nextEquipmentId(equipment: EquipmentUnit[]): string {
  const max = equipment
    .map((item) => Number(item.id.split('-').at(-1) ?? 0))
    .reduce((left, right) => Math.max(left, right), 0)

  return `eq-${max + 1}`
}

function nextSerialNumber(equipment: EquipmentUnit[]): string {
  const maxTail = equipment
    .map((item) => Number(item.serialNumber.replace(/\D/g, '').slice(-8)))
    .reduce((left, right) => Math.max(left, Number.isFinite(right) ? right : 0), 0)

  return `SN-${String(maxTail + 1).padStart(8, '0')}`
}

function createEmptyEquipment(
  equipment: EquipmentUnit[],
  equipmentTypes: EquipmentType[],
): EquipmentUnit {
  return {
    id: nextEquipmentId(equipment),
    typeId: equipmentTypes[0]?.id ?? '',
    siteId: undefined,
    serialNumber: nextSerialNumber(equipment),
    name: '',
    weight: 0,
    description: '',
  }
}

export function EquipmentModule({
  user,
  equipment,
  sites,
  clients,
  equipmentTypes,
  products,
  onUpsertEquipment,
  onDeleteEquipment,
}: EquipmentModuleProps) {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  const [equipmentDraft, setEquipmentDraft] = useState<EquipmentUnit | null>(null)
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)

  const canEdit = canEditEquipment(user)

  const visibleEquipment = useMemo(
    () => (canViewEquipment(user) ? equipment : []),
    [equipment, user],
  )

  const filteredEquipment = useMemo(() => {
    return visibleEquipment.filter((item) => {
      const site = sites.find((siteItem) => siteItem.id === item.siteId)
      const typeName =
        equipmentTypes.find((type) => type.id === item.typeId)?.name.toLowerCase() ?? ''
      const siteName = site?.name.toLowerCase() ?? ''

      if (clientFilter && site?.clientId !== clientFilter) {
        return false
      }

      if (productFilter && !site?.productIds.includes(productFilter)) {
        return false
      }

      if (!search.trim()) {
        return true
      }

      const normalized = search.toLowerCase()
      return (
        item.name.toLowerCase().includes(normalized) ||
        item.serialNumber.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized) ||
        typeName.includes(normalized) ||
        siteName.includes(normalized)
      )
    })
  }, [search, visibleEquipment, equipmentTypes, sites, clientFilter, productFilter])

  const selectedEquipment =
    (selectedEquipmentId
      ? visibleEquipment.find((item) => item.id === selectedEquipmentId)
      : null) ?? null

  function resolveTypeName(typeId: string): string {
    return equipmentTypes.find((item) => item.id === typeId)?.name ?? 'Не задан'
  }

  function resolveSiteName(siteId?: string): string {
    if (!siteId) {
      return 'Не привязано'
    }

    return sites.find((item) => item.id === siteId)?.name ?? 'Площадка не найдена'
  }

  function resolveClientName(siteId?: string): string {
    if (!siteId) {
      return 'Не определён'
    }

    const site = sites.find((item) => item.id === siteId)
    return clients.find((client) => client.id === site?.clientId)?.name ?? 'Не определён'
  }

  function resolveProductNames(siteId?: string): string {
    if (!siteId) {
      return 'Не определён'
    }

    const site = sites.find((item) => item.id === siteId)
    if (!site || site.productIds.length === 0) {
      return 'Не определён'
    }

    return site.productIds
      .map((productId) => products.find((product) => product.id === productId)?.name ?? productId)
      .join(', ')
  }

  async function saveEquipment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!equipmentDraft || isSavingRef.current) {
      return
    }

    isSavingRef.current = true
    setIsSaving(true)

    try {
      const safeDraft: EquipmentUnit = {
        ...equipmentDraft,
        weight: Math.max(0, Number(equipmentDraft.weight) || 0),
        siteId: equipmentDraft.siteId || undefined,
      }

      await onUpsertEquipment(safeDraft)
      setSelectedEquipmentId(safeDraft.id)
      setEquipmentDraft(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить оборудование.')
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  if (user.role === 'client') {
    return (
      <section className="module-wrap">
        <h1>Оборудование</h1>
        <p className="empty-state">У роли Клиент нет доступа к модулю оборудования.</p>
      </section>
    )
  }

  return (
    <section className="module-wrap">
      <div className="module-title-row">
        <h1>Оборудование</h1>
        {canEdit && !selectedEquipment && !equipmentDraft ? (
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              setEquipmentDraft(createEmptyEquipment(equipment, equipmentTypes))
              setSelectedEquipmentId(null)
            }}
          >
            Добавить оборудование
          </button>
        ) : null}
      </div>

      {!selectedEquipment && !equipmentDraft ? (
        <div className="form-grid">
          <label>
            Заказчик
            <CustomSelect
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              options={[
                { value: '', label: 'Все заказчики' },
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
            Продукт
            <CustomSelect
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              options={[
                { value: '', label: 'Все продукты' },
                ...products.map((product) => ({
                  value: product.id,
                  label: product.name,
                })),
              ]}
              placeholder={null}
              showPlaceholder={false}
            />
          </label>

          <label>
            Поиск
            <input
              className="text-input"
              placeholder="По названию, серийному номеру, типу или площадке"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {equipmentDraft ? (
        <div
          className="modal-overlay"
          onClick={(event) => event.target === event.currentTarget && setEquipmentDraft(null)}
        >
          <div className="modal-card">
            <button
              className="modal-close"
              type="button"
              onClick={() => setEquipmentDraft(null)}
              aria-label="Закрыть"
            >
              x
            </button>

            <form className="inline-form modal-form" onSubmit={saveEquipment}>
              <h3 className="modal-title">
                {selectedEquipment ? 'Редактирование оборудования' : 'Новая единица оборудования'}
              </h3>

              <div className="form-grid">
                <label>
                  <span className="field-label">
                    Тип оборудования <span className="required">*</span>
                  </span>
                  <CustomSelect
                    value={equipmentDraft.typeId}
                    onChange={(event) =>
                      setEquipmentDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              typeId: event.target.value,
                            }
                          : previous,
                      )
                    }
                    options={equipmentTypes.map((type) => ({
                      value: type.id,
                      label: type.name,
                    }))}
                    placeholder={null}
                    showPlaceholder={false}
                    required
                  />
                </label>

                <label>
                  <span className="field-label">
                    Серийный номер <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={equipmentDraft.serialNumber}
                    onChange={(event) =>
                      setEquipmentDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              serialNumber: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="SN-00000001"
                  />
                </label>

                <label>
                  <span className="field-label">
                    Название <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={equipmentDraft.name}
                    onChange={(event) =>
                      setEquipmentDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              name: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="Например, Маршрутизатор Cisco"
                  />
                </label>

                <label>
                  <span className="field-label">
                    Вес (кг) <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={equipmentDraft.weight}
                    onChange={(event) =>
                      setEquipmentDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              weight: Number(event.target.value),
                            }
                          : previous,
                      )
                    }
                    required
                  />
                </label>

                <label className="full-width">
                  <span className="field-label">Площадка</span>
                  <CustomSelect
                    value={equipmentDraft.siteId ?? ''}
                    onChange={(event) =>
                      setEquipmentDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              siteId: event.target.value || undefined,
                            }
                          : previous,
                      )
                    }
                    options={[
                      { value: '', label: 'Не указана' },
                      ...sites.map((site) => ({
                        value: site.id,
                        label: `${site.name} (${site.address})`,
                      })),
                    ]}
                    placeholder={null}
                    showPlaceholder={false}
                  />
                </label>
              </div>

              <label className="full-width">
                <span className="field-label">Описание</span>
                <textarea
                  className="text-input text-area"
                  rows={4}
                  value={equipmentDraft.description}
                  onChange={(event) =>
                    setEquipmentDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            description: event.target.value,
                          }
                        : previous,
                    )
                  }
                  placeholder="Короткое описание или примечание по оборудованию"
                />
              </label>

              <div className="section-head-row modal-actions">
                <button
                  type="button"
                  className="ghost-button button-sm"
                  onClick={() => setEquipmentDraft(null)}
                  disabled={isSaving}
                >
                  Отмена
                </button>
                <button type="submit" className="primary-button button-sm" disabled={isSaving}>
                  {isSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedEquipment ? (
        <article className="details-screen">
          <div className="module-title-row">
            <h2>{selectedEquipment.name}</h2>
            <button
              type="button"
              className="ghost-button button-sm"
              onClick={() => setSelectedEquipmentId(null)}
            >
              К списку
            </button>
          </div>

          <div className="data-columns">
            <div>
              <p>
                <strong>Серийный номер:</strong> {selectedEquipment.serialNumber}
              </p>
              <p>
                <strong>Тип:</strong> {resolveTypeName(selectedEquipment.typeId)}
              </p>
              <p>
                <strong>Вес:</strong> {selectedEquipment.weight} кг
              </p>
              <p>
                <strong>Площадка:</strong> {resolveSiteName(selectedEquipment.siteId)}
              </p>
              <p>
                <strong>Заказчик:</strong> {resolveClientName(selectedEquipment.siteId)}
              </p>
              <p>
                <strong>Продукты площадки:</strong> {resolveProductNames(selectedEquipment.siteId)}
              </p>
            </div>
          </div>

          <p>{selectedEquipment.description || 'Описание не указано.'}</p>

          {canEdit ? (
            <div className="section-head-row">
              <button
                type="button"
                className="primary-button button-sm"
                onClick={() => setEquipmentDraft(selectedEquipment)}
              >
                Редактировать
              </button>
              <button
                type="button"
                className="danger-button button-sm"
                onClick={() => {
                  void onDeleteEquipment(selectedEquipment.id)
                  setSelectedEquipmentId(null)
                }}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="cards-column">
          {filteredEquipment.map((item) => (
            <button
              type="button"
              key={item.id}
              className="appeal-card"
              onClick={() => setSelectedEquipmentId(item.id)}
            >
              <div className="card-row">
                <strong>{item.name}</strong>
                <span>{resolveTypeName(item.typeId)}</span>
              </div>
              <p>Серийный номер: {item.serialNumber}</p>
              <p>Площадка: {resolveSiteName(item.siteId)}</p>
              <p>Заказчик: {resolveClientName(item.siteId)}</p>
              <p>Вес: {item.weight} кг</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
