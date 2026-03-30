import { useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  ClientCompany,
  EquipmentType,
  EquipmentUnit,
  ProductCatalogItem,
  Site,
  UserProfile,
} from '../types'
import {
  canManageCustomerSites,
  canManageCustomers,
  canViewCustomer,
  canViewCustomerSite,
} from '../utils/permissions'
import { CustomSelect } from '../components/CustomSelect'
import { CustomMultiSelect } from '../components/CustomMultiSelect'

interface CustomersModuleProps {
  user: UserProfile
  customers: ClientCompany[]
  sites: Site[]
  equipment: EquipmentUnit[]
  equipmentTypes: EquipmentType[]
  products: ProductCatalogItem[]
  selectedCustomerId: string | null
  selectedSiteId: string | null
  onSelectCustomer: (customerId: string | null) => void
  onSelectSite: (siteId: string | null) => void
  onUpsertCustomer: (customer: ClientCompany) => Promise<void>
  onDeleteCustomer: (customerId: string) => Promise<void>
  onUpsertSite: (site: Site) => Promise<void>
  onDeleteSite: (siteId: string) => Promise<void>
  onAttachEquipmentToSite: (equipmentId: string, siteId: string) => Promise<void>
}

function nextCustomerId(customers: ClientCompany[]): string {
  const max = customers
    .map((customer) => Number(customer.id.split('-').at(-1) ?? 0))
    .reduce((left, right) => Math.max(left, right), 0)

  return `client-${max + 1}`
}

function nextSiteId(sites: Site[]): string {
  const max = sites
    .map((site) => Number(site.id.split('-').at(-1) ?? 0))
    .reduce((left, right) => Math.max(left, right), 0)

  return `site-${max + 1}`
}

function createEmptyCustomer(customers: ClientCompany[]): ClientCompany {
  return {
    id: nextCustomerId(customers),
    name: '',
    address: '',
    ceoId: undefined,
    representatives: [],
  }
}

function createEmptySite(
  sites: Site[],
  customerId: string,
  customers: ClientCompany[],
  products: ProductCatalogItem[],
): Site {
  const customer = customers.find((item) => item.id === customerId)
  return {
    id: nextSiteId(sites),
    name: '',
    address: '',
    responsibleId: customer?.representatives[0]?.accountId ?? '',
    clientId: customerId,
    productIds: products[0]?.id ? [products[0].id] : [],
  }
}

export function CustomersModule({
  user,
  customers,
  sites,
  equipment,
  equipmentTypes,
  products,
  selectedCustomerId,
  selectedSiteId,
  onSelectCustomer,
  onSelectSite,
  onUpsertCustomer,
  onDeleteCustomer,
  onUpsertSite,
  onDeleteSite,
  onAttachEquipmentToSite,
}: CustomersModuleProps) {
  const [customerDraft, setCustomerDraft] = useState<ClientCompany | null>(null)
  const [siteDraft, setSiteDraft] = useState<Site | null>(null)
  const [equipmentToAttach, setEquipmentToAttach] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [addressFilter, setAddressFilter] = useState('')
  const [representativeQuery, setRepresentativeQuery] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [isCustomerSaving, setIsCustomerSaving] = useState(false)
  const [isSiteSaving, setIsSiteSaving] = useState(false)
  const isCustomerSavingRef = useRef(false)
  const isSiteSavingRef = useRef(false)

  const canEditCustomers = canManageCustomers(user)
  const canEditSites = canManageCustomerSites(user)

  const visibleCustomers = useMemo(
    () =>
      customers
        .filter((customer) => canViewCustomer(user, customer))
        .filter((customer) => {
          const normalizedCustomerQuery = customerQuery.trim().toLowerCase()
          const normalizedAddressFilter = addressFilter.trim().toLowerCase()
          const normalizedRepresentativeQuery = representativeQuery.trim().toLowerCase()

          const matchesName =
            !normalizedCustomerQuery || customer.name.toLowerCase().includes(normalizedCustomerQuery)
          const matchesAddress =
            !normalizedAddressFilter ||
            customer.address.toLowerCase().includes(normalizedAddressFilter)
          const matchesRepresentative =
            !normalizedRepresentativeQuery ||
            customer.representatives.some((representative) =>
              `${representative.fullName} ${representative.phoneNumber} ${representative.email} ${representative.login}`
                .toLowerCase()
                .includes(normalizedRepresentativeQuery),
            )
          const matchesProduct =
            !productFilter ||
            sites.some(
              (site) => site.clientId === customer.id && site.productIds.includes(productFilter),
            )

          return matchesName && matchesAddress && matchesRepresentative && matchesProduct
        }),
    [addressFilter, customerQuery, customers, productFilter, representativeQuery, sites, user],
  )

  const visibleSites = useMemo(
    () => sites.filter((site) => canViewCustomerSite(user, site)),
    [sites, user],
  )

  const selectedCustomer =
    (selectedCustomerId
      ? visibleCustomers.find((customer) => customer.id === selectedCustomerId)
      : null) ?? null

  const selectedSite =
    (selectedSiteId ? visibleSites.find((site) => site.id === selectedSiteId) : null) ?? null

  const selectedCustomerSites = selectedCustomer
    ? visibleSites.filter((site) => site.clientId === selectedCustomer.id)
    : []

  const selectedSiteEquipment = selectedSite
    ? equipment.filter((item) => item.siteId === selectedSite.id)
    : []

  const availableEquipmentToAttach = selectedSite
    ? equipment.filter((item) => !item.siteId)
    : []

  function resolveEquipmentTypeName(typeId: string): string {
    return equipmentTypes.find((type) => type.id === typeId)?.name ?? 'Не задан'
  }

  function resolveRepresentativeName(customer: ClientCompany, representativeId?: string): string {
    if (!representativeId) {
      return 'Не назначен'
    }

    return (
      customer.representatives.find((representative) => representative.accountId === representativeId)
        ?.fullName ?? 'Не найден'
    )
  }

  function resolveProductNames(productIds: string[]): string {
    return (
      productIds
        .map((productId) => products.find((product) => product.id === productId)?.name ?? productId)
        .join(', ') || 'Не выбраны'
    )
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!customerDraft || isCustomerSavingRef.current) {
      return
    }

    isCustomerSavingRef.current = true
    setIsCustomerSaving(true)

    try {
      await onUpsertCustomer(customerDraft)
      onSelectCustomer(customerDraft.id)
      setCustomerDraft(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить заказчика.')
    } finally {
      isCustomerSavingRef.current = false
      setIsCustomerSaving(false)
    }
  }

  async function saveSite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!siteDraft || isSiteSavingRef.current) {
      return
    }

    isSiteSavingRef.current = true
    setIsSiteSaving(true)

    try {
      await onUpsertSite(siteDraft)
      onSelectCustomer(siteDraft.clientId)
      onSelectSite(siteDraft.id)
      setSiteDraft(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить площадку.')
    } finally {
      isSiteSavingRef.current = false
      setIsSiteSaving(false)
    }
  }

  if (visibleCustomers.length === 0 && !canEditCustomers) {
    return (
      <section className="module-wrap">
        <h1>Заказчики</h1>
        <p className="empty-state">Для текущей роли нет доступных заказчиков.</p>
      </section>
    )
  }

  return (
    <section className="module-wrap">
      <div className="module-title-row">
        <h1>Заказчики</h1>
        {canEditCustomers && !selectedCustomer && !selectedSite && !customerDraft && !siteDraft ? (
          <button
            type="button"
            className="primary-button button-sm"
            onClick={() => {
              setCustomerDraft(createEmptyCustomer(customers))
              onSelectCustomer(null)
              onSelectSite(null)
            }}
          >
            Добавить заказчика
          </button>
        ) : null}
      </div>

      {!selectedCustomer && !selectedSite && !customerDraft && !siteDraft ? (
        <div className="form-grid">
          <label>
            Заказчик
            <input
              className="text-input"
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="По названию компании"
            />
          </label>

          <label>
            Адрес
            <input
              className="text-input"
              value={addressFilter}
              onChange={(event) => setAddressFilter(event.target.value)}
              placeholder="По адресу"
            />
          </label>

          <label>
            Представитель
            <input
              className="text-input"
              value={representativeQuery}
              onChange={(event) => setRepresentativeQuery(event.target.value)}
              placeholder="По ФИО, телефону, email или логину"
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
        </div>
      ) : null}

      {customerDraft ? (
        <div
          className="modal-overlay"
          onClick={(event) =>
            !isCustomerSaving && event.target === event.currentTarget && setCustomerDraft(null)
          }
        >
          <div className="modal-card">
            <button
              className="modal-close"
              type="button"
              onClick={() => setCustomerDraft(null)}
              aria-label="Закрыть"
              disabled={isCustomerSaving}
            >
              x
            </button>

            <form className="inline-form modal-form" onSubmit={saveCustomer}>
              <h3 className="modal-title">
                {selectedCustomer ? 'Редактирование заказчика' : 'Новый заказчик'}
              </h3>

              <div className="form-grid">
                <label>
                  <span className="field-label">
                    Название компании <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={customerDraft.name}
                    onChange={(event) =>
                      setCustomerDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              name: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="Например, ООО Ромашка"
                  />
                </label>

                <label className="full-width">
                  <span className="field-label">
                    Адрес <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={customerDraft.address}
                    onChange={(event) =>
                      setCustomerDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              address: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="Город, улица, дом"
                  />
                </label>

                <label className="full-width">
                  <span className="field-label">CEO (представитель)</span>
                  <CustomSelect
                    value={customerDraft.ceoId ?? ''}
                    onChange={(event) =>
                      setCustomerDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              ceoId: event.target.value || undefined,
                            }
                          : previous,
                      )
                    }
                    options={[
                      { value: '', label: 'Не задан' },
                      ...customerDraft.representatives.map((representative) => ({
                        value: representative.accountId,
                        label: representative.fullName,
                      })),
                    ]}
                    placeholder={null}
                    showPlaceholder={false}
                  />
                </label>
              </div>

              <div className="section-head-row modal-actions">
                <button
                  type="button"
                  className="ghost-button button-sm"
                  onClick={() => setCustomerDraft(null)}
                  disabled={isCustomerSaving}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="primary-button button-sm"
                  disabled={isCustomerSaving}
                >
                  {isCustomerSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {siteDraft ? (
        <div
          className="modal-overlay"
          onClick={(event) =>
            !isSiteSaving && event.target === event.currentTarget && setSiteDraft(null)
          }
        >
          <div className="modal-card">
            <button
              className="modal-close"
              type="button"
              onClick={() => setSiteDraft(null)}
              aria-label="Закрыть"
              disabled={isSiteSaving}
            >
              x
            </button>

            <form className="inline-form modal-form" onSubmit={saveSite}>
              <h3 className="modal-title">
                {selectedSite ? 'Редактирование площадки' : 'Новая площадка'}
              </h3>

              <div className="form-grid">
                <label>
                  <span className="field-label">
                    Заказчик <span className="required">*</span>
                  </span>
                  <CustomSelect
                    value={siteDraft.clientId}
                    onChange={(event) => {
                      const nextClientId = event.target.value
                      const targetCustomer = customers.find((customer) => customer.id === nextClientId)
                      setSiteDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              clientId: nextClientId,
                              responsibleId: targetCustomer?.representatives[0]?.accountId ?? '',
                            }
                          : previous,
                      )
                    }}
                    options={visibleCustomers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                    }))}
                    placeholder={null}
                    showPlaceholder={false}
                  />
                </label>

                <label>
                  <span className="field-label">
                    Название площадки <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={siteDraft.name}
                    onChange={(event) =>
                      setSiteDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              name: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="Например, Центральный узел"
                  />
                </label>

                <label className="full-width">
                  <span className="field-label">
                    Адрес площадки <span className="required">*</span>
                  </span>
                  <input
                    className="text-input"
                    value={siteDraft.address}
                    onChange={(event) =>
                      setSiteDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              address: event.target.value,
                            }
                          : previous,
                      )
                    }
                    required
                    placeholder="Город, улица, дом"
                  />
                </label>

                <label>
                  <span className="field-label">
                    Ответственный представитель <span className="required">*</span>
                  </span>
                  <CustomSelect
                    value={siteDraft.responsibleId}
                    onChange={(event) =>
                      setSiteDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              responsibleId: event.target.value,
                            }
                          : previous,
                      )
                    }
                    options={
                      customers
                        .find((customer) => customer.id === siteDraft.clientId)
                        ?.representatives.map((representative) => ({
                          value: representative.accountId,
                          label: representative.fullName,
                        })) ?? []
                    }
                    placeholder={null}
                    showPlaceholder={false}
                    required
                  />
                </label>

                <label className="full-width">
                  <span className="field-label">
                    Продукты <span className="required">*</span>
                  </span>
                  <CustomMultiSelect
                    value={siteDraft.productIds}
                    onChange={(event) => {
                      const selectedProducts = Array.from(event.target.selectedOptions).map(
                        (option) => option.value,
                      )

                      setSiteDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              productIds: selectedProducts,
                            }
                          : previous,
                      )
                    }}
                    options={products.map((product) => ({
                      value: product.id,
                      label: product.name,
                    }))}
                    size={Math.max(3, Math.min(6, products.length))}
                  />
                  <span className="form-hint">Удерживайте Ctrl или Cmd, чтобы выбрать несколько продуктов.</span>
                </label>
              </div>

              <div className="section-head-row modal-actions">
                <button
                  type="button"
                  className="ghost-button button-sm"
                  onClick={() => setSiteDraft(null)}
                  disabled={isSiteSaving}
                >
                  Отмена
                </button>
                <button type="submit" className="primary-button button-sm" disabled={isSiteSaving}>
                  {isSiteSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedSite && selectedCustomer ? (
        <article className="details-screen">
          <div className="module-title-row">
            <h2>{selectedSite.name}</h2>
            <button type="button" className="ghost-button button-sm" onClick={() => onSelectSite(null)}>
              К карточке заказчика
            </button>
          </div>

          <p>
            <strong>Заказчик:</strong> {selectedCustomer.name}
          </p>
          <p>
            <strong>Адрес площадки:</strong> {selectedSite.address}
          </p>
          <p>
            <strong>Ответственный:</strong>{' '}
            {resolveRepresentativeName(selectedCustomer, selectedSite.responsibleId)}
          </p>
          <p>
            <strong>Продукты:</strong> {resolveProductNames(selectedSite.productIds)}
          </p>

          <div className="section-head-row">
            <h3>Оборудование на площадке</h3>
          </div>

          {canEditSites ? (
            <div className="inline-form compact">
              <label>
                Добавить из модуля оборудования
                <CustomSelect
                  value={equipmentToAttach}
                  onChange={(event) => setEquipmentToAttach(event.target.value)}
                  options={[
                    { value: '', label: 'Выберите оборудование' },
                    ...availableEquipmentToAttach.map((item) => ({
                      value: item.id,
                      label: `${item.name} (${item.serialNumber})`,
                    })),
                  ]}
                  placeholder={null}
                  showPlaceholder={false}
                />
              </label>
              <button
                type="button"
                className="primary-button button-sm"
                disabled={!equipmentToAttach}
                onClick={() => {
                  if (!selectedSite || !equipmentToAttach) {
                    return
                  }

                  void onAttachEquipmentToSite(equipmentToAttach, selectedSite.id)
                  setEquipmentToAttach('')
                }}
              >
                Добавить
              </button>
            </div>
          ) : null}

          <div className="cards-column">
            {selectedSiteEquipment.length > 0 ? (
              selectedSiteEquipment.map((unit) => (
                <div key={unit.id} className="plain-card">
                  <p>
                    <strong>{unit.name}</strong>
                  </p>
                  <p>Серийный номер: {unit.serialNumber}</p>
                  <p>Тип: {resolveEquipmentTypeName(unit.typeId)}</p>
                  <p>Вес: {unit.weight} кг</p>
                </div>
              ))
            ) : (
              <p className="empty-inline">На площадке пока нет оборудования.</p>
            )}
          </div>

          {canEditSites ? (
            <div className="section-head-row">
              <button type="button" className="primary-button button-sm" onClick={() => setSiteDraft(selectedSite)}>
                Редактировать площадку
              </button>
              <button
                type="button"
                className="danger-button button-sm"
                onClick={() => {
                  void onDeleteSite(selectedSite.id)
                  onSelectSite(null)
                }}
              >
                Удалить площадку
              </button>
            </div>
          ) : null}
        </article>
      ) : selectedCustomer ? (
        <article className="details-screen">
          <div className="module-title-row">
            <h2>{selectedCustomer.name}</h2>
            <button
              type="button"
              className="ghost-button button-sm"
              onClick={() => {
                onSelectCustomer(null)
                onSelectSite(null)
              }}
            >
              К списку
            </button>
          </div>

          <div className="data-columns">
            <div>
              <p>
                <strong>Адрес:</strong> {selectedCustomer.address}
              </p>
              <p>
                <strong>CEO:</strong>{' '}
                {resolveRepresentativeName(selectedCustomer, selectedCustomer.ceoId)}
              </p>
            </div>
          </div>

          <div className="section-head-row">
            <h3>Представители заказчика</h3>
          </div>

          <div className="cards-column">
            {selectedCustomer.representatives.length > 0 ? (
              selectedCustomer.representatives.map((representative) => (
                <div key={representative.accountId} className="plain-card">
                  <p>
                    <strong>{representative.fullName}</strong>
                  </p>
                  <p>{representative.phoneNumber}</p>
                  <p>{representative.email}</p>
                </div>
              ))
            ) : (
              <p className="empty-inline">У компании пока нет представителей.</p>
            )}
          </div>

          <div className="section-head-row">
            <h3>Площадки заказчика</h3>
            {canEditSites ? (
              <button
                type="button"
                className="primary-button button-sm"
                onClick={() => setSiteDraft(createEmptySite(sites, selectedCustomer.id, customers, products))}
              >
                Добавить площадку
              </button>
            ) : null}
          </div>

          <div className="cards-column">
            {selectedCustomerSites.length > 0 ? (
              selectedCustomerSites.map((site) => (
                <button
                  type="button"
                  key={site.id}
                  className="appeal-card"
                  onClick={() => onSelectSite(site.id)}
                >
                  <div className="card-row">
                    <strong>{site.name}</strong>
                    <span>{resolveProductNames(site.productIds)}</span>
                  </div>
                  <p>{site.address}</p>
                  <p>
                    Единиц оборудования:{' '}
                    {equipment.filter((item) => item.siteId === site.id).length}
                  </p>
                </button>
              ))
            ) : (
              <p className="empty-inline">У заказчика пока нет площадок.</p>
            )}
          </div>

          {canEditCustomers ? (
            <div className="section-head-row">
              <button
                type="button"
                className="primary-button button-sm"
                onClick={() => setCustomerDraft(selectedCustomer)}
              >
                Редактировать заказчика
              </button>
              <button
                type="button"
                className="danger-button button-sm"
                onClick={() => {
                  void onDeleteCustomer(selectedCustomer.id)
                  onSelectCustomer(null)
                  onSelectSite(null)
                }}
              >
                Удалить заказчика
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="cards-column">
          {visibleCustomers.map((customer) => (
            <button
              type="button"
              key={customer.id}
              className="appeal-card"
              onClick={() => onSelectCustomer(customer.id)}
            >
              <div className="card-row">
                <strong>{customer.name}</strong>
                <span>{customer.representatives.length} представителя</span>
              </div>
              <p>{customer.address}</p>
              <p>Площадок: {visibleSites.filter((site) => site.clientId === customer.id).length}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
