import type {
  Appeal,
  ClientCompany,
  CrmBootstrapData,
  Employee,
  EquipmentType,
  EquipmentUnit,
  ProductCatalogItem,
  Reaction,
  Site,
  TicketCriticality,
  TicketStatus,
  TicketType,
  UserProfile,
} from './types'

const products: ProductCatalogItem[] = [
  {
    id: 'product-1',
    name: 'MKD',
    description: 'Мультисервисный комплекс доступа',
  },
  {
    id: 'product-2',
    name: 'Internet',
    description: 'Услуга доступа в интернет',
  },
  {
    id: 'product-3',
    name: 'IP-телефония',
    description: 'Услуга IP-телефонии',
  },
]

const equipmentTypes: EquipmentType[] = [
  {
    id: 'eq-type-1',
    name: 'Абонентское оборудование',
    description: 'Оборудование на стороне клиента',
  },
  {
    id: 'eq-type-2',
    name: 'Пассивные сетевые установки',
    description: 'Пассивные элементы сетевой инфраструктуры',
  },
  {
    id: 'eq-type-3',
    name: 'Системы коммутации',
    description: 'Коммутационное оборудование',
  },
  {
    id: 'eq-type-4',
    name: 'ПО',
    description: 'Программные компоненты',
  },
]

const ticketTypes: TicketType[] = [
  { id: 'ticket-type-1', name: 'KTP' },
  { id: 'ticket-type-2', name: 'WFM' },
]

const ticketStatuses: TicketStatus[] = [
  { id: 'ticket-status-1', name: 'Created' },
  { id: 'ticket-status-2', name: 'Opened' },
  { id: 'ticket-status-3', name: 'Customer Pending' },
  { id: 'ticket-status-4', name: 'Done' },
  { id: 'ticket-status-5', name: 'Verified' },
]

const ticketCriticalities: TicketCriticality[] = [
  { id: 'ticket-criticality-1', name: 'Basic', deadlineDays: 30 },
  { id: 'ticket-criticality-2', name: 'Important', deadlineDays: 15 },
  { id: 'ticket-criticality-3', name: 'Critical', deadlineDays: 1 },
]

const reactions: Reaction[] = [
  { id: 'reaction-1', name: 'like', picture: '' },
  { id: 'reaction-2', name: 'dislike', picture: '' },
  { id: 'reaction-3', name: 'done', picture: '' },
]

const employees: Employee[] = [
  {
    accountId: 'acc-emp-admin-1',
    fullName: 'Егор Власов',
    image: '',
    birthDate: '1988-05-16',
    position: 'Администратор CRM',
    phoneNumber: '+7 (900) 100-10-10',
    email: 'admin@ebko.local',
    role: 'admin',
    login: 'admin',
    passwordHash: 'admin',
    hireDate: '2022-11-01',
  },
  {
    accountId: 'acc-emp-ktp-1',
    fullName: 'Илья Новиков',
    image: '',
    birthDate: '1994-07-09',
    position: 'Оператор КТП',
    phoneNumber: '+7 (900) 101-10-10',
    email: 'ktp@ebko.local',
    role: 'ktp',
    login: 'ktp',
    passwordHash: 'ktp',
    hireDate: '2023-02-15',
  },
  {
    accountId: 'acc-emp-wfm-1',
    fullName: 'Марк Громов',
    image: '',
    birthDate: '1996-11-03',
    position: 'Инженер WFM',
    phoneNumber: '+7 (900) 102-10-10',
    email: 'wfm@ebko.local',
    role: 'wfm',
    login: 'wfm',
    passwordHash: 'wfm',
    hireDate: '2023-06-20',
  },
  {
    accountId: 'acc-emp-ktp-2',
    fullName: 'Кристина Орлова',
    image: '',
    birthDate: '1998-04-27',
    position: 'Оператор КТП',
    phoneNumber: '+7 (900) 103-10-10',
    email: 'ktp2@ebko.local',
    role: 'ktp',
    login: 'ktp2',
    passwordHash: 'ktp234',
    hireDate: '2024-01-10',
  },
  {
    accountId: 'acc-emp-ebko-1',
    fullName: 'Oleg Ebko',
    image: '',
    birthDate: '1982-12-14',
    position: 'EBKO Director',
    phoneNumber: '+7 (900) 104-10-10',
    email: 'ebko@ebko.local',
    role: 'ebko',
    login: 'ebko',
    passwordHash: 'ebko',
    hireDate: '2021-09-01',
  },
]

const clients: ClientCompany[] = [
  {
    id: 'client-1',
    name: 'ООО Альфа Логистик',
    address: 'г. Москва, ул. Летняя, 16',
    ceoId: 'acc-rep-1',
    representatives: [
      {
        accountId: 'acc-rep-1',
        clientId: 'client-1',
        fullName: 'Ирина Смирнова',
        image: '',
        birthDate: '1990-03-18',
        position: 'Главный представитель',
        phoneNumber: '+7 (903) 111-11-11',
        email: 'i.smirnova@alpha-log.ru',
        login: 'client',
        passwordHash: 'client',
        role: 'client',
      },
      {
        accountId: 'acc-rep-2',
        clientId: 'client-1',
        fullName: 'Александр Нестеров',
        image: '',
        birthDate: '1987-10-02',
        position: 'Технический координатор',
        phoneNumber: '+7 (903) 111-11-12',
        email: 'a.nesterov@alpha-log.ru',
        login: 'client2',
        passwordHash: 'client234',
        role: 'client',
      },
    ],
  },
  {
    id: 'client-2',
    name: 'АО Север Нет',
    address: 'г. Санкт-Петербург, пр. Речной, 7',
    ceoId: 'acc-rep-3',
    representatives: [
      {
        accountId: 'acc-rep-3',
        clientId: 'client-2',
        fullName: 'Дмитрий Поляков',
        image: '',
        birthDate: '1992-07-11',
        position: 'Менеджер площадки',
        phoneNumber: '+7 (911) 123-45-67',
        email: 'd.polyakov@severnet.ru',
        login: 'north',
        passwordHash: 'north123',
        role: 'client',
      },
    ],
  },
]

const sites: Site[] = [
  {
    id: 'site-1',
    name: 'Летняя 18',
    address: 'г. Москва, ул. Летняя, 18, офис 11',
    responsibleId: 'acc-rep-1',
    clientId: 'client-1',
    productIds: ['product-1', 'product-2'],
  },
  {
    id: 'site-2',
    name: 'Ильменская 4',
    address: 'г. Москва, ул. Ильменская, 4',
    responsibleId: 'acc-rep-2',
    clientId: 'client-1',
    productIds: ['product-3'],
  },
  {
    id: 'site-3',
    name: 'Новая 51',
    address: 'г. Санкт-Петербург, ул. Новая, 51',
    responsibleId: 'acc-rep-3',
    clientId: 'client-2',
    productIds: ['product-2'],
  },
]

const equipment: EquipmentUnit[] = [
  {
    id: 'eq-1',
    typeId: 'eq-type-3',
    siteId: 'site-1',
    serialNumber: 'SN-10010000000123',
    name: 'MKD Gateway 24',
    weight: 3.2,
    description: 'Шлюз доступа для IP-телефонии с поддержкой SIP',
  },
  {
    id: 'eq-2',
    typeId: 'eq-type-3',
    siteId: 'site-3',
    serialNumber: 'SN-20020000000456',
    name: 'Router B2B Pro',
    weight: 2.7,
    description: 'Маршрутизатор для корпоративных клиентов',
  },
  {
    id: 'eq-3',
    typeId: 'eq-type-4',
    siteId: 'site-2',
    serialNumber: 'SN-30030000000789',
    name: 'IP PBX Core License',
    weight: 0,
    description: 'Лицензия ядра виртуальной АТС',
  },
  {
    id: 'eq-4',
    typeId: 'eq-type-1',
    siteId: 'site-2',
    serialNumber: 'SN-40040000000111',
    name: 'Абонентский ONU CPE-8',
    weight: 1.4,
    description: 'Резервная единица оборудования без привязки к площадке',
  },
]

const appeals: Appeal[] = [
  {
    id: 'appeal-1',
    title: 'CRM-1001',
    description:
      'Периодически пропадает доступ к интернету на площадке Москва/Летняя 18. Обрывы длятся 2-3 минуты и влияют на работу call-центра.',
    typeId: 'KTP',
    statusId: 'Opened',
    criticalityId: 'Critical',
    productId: 'product-2',
    clientId: 'client-1',
    siteId: 'site-1',
    responsibleId: 'acc-emp-ktp-1',
    createdBy: 'acc-rep-1',
    updatedBy: 'acc-emp-ktp-1',
    createdAt: '2026-02-12T08:10:00.000Z',
    updatedAt: '2026-02-24T10:30:00.000Z',
    linkedTicketIds: ['appeal-3'],
    comments: [
      {
        id: 'comment-1',
        ticketId: 'appeal-1',
        isClosedComment: false,
        createdBy: 'acc-rep-1',
        authorName: 'Ирина Смирнова',
        contents: 'Подтверждаю проблему, вчера падение было три раза.',
        createdAt: '2026-02-23T09:12:00.000Z',
        updatedAt: '2026-02-23T09:12:00.000Z',
        files: [],
      },
      {
        id: 'comment-2',
        ticketId: 'appeal-1',
        isClosedComment: false,
        createdBy: 'acc-emp-ktp-1',
        authorName: 'Илья Новиков',
        contents: 'Запросили логи с маршрутизатора, прикрепил шаблон отчета.',
        createdAt: '2026-02-24T10:30:00.000Z',
        updatedAt: '2026-02-24T10:30:00.000Z',
        files: [{ id: 'f-1', name: 'report-template.md', size: 2214 }],
      },
    ],
  },
  {
    id: 'appeal-2',
    title: 'CRM-1002',
    description:
      'Проблема с исходящими звонками через IP-телефонию. На части номеров фиксируется код 503.',
    typeId: 'KTP',
    statusId: 'Opened',
    criticalityId: 'Important',
    productId: 'product-3',
    clientId: 'client-2',
    siteId: 'site-3',
    responsibleId: 'acc-emp-ktp-2',
    createdBy: 'acc-rep-3',
    updatedBy: 'acc-emp-ktp-2',
    createdAt: '2026-02-18T12:00:00.000Z',
    updatedAt: '2026-02-24T09:10:00.000Z',
    linkedTicketIds: [],
    comments: [],
  },
  {
    id: 'appeal-3',
    title: 'Наряд-2001',
    description:
      'Выезд инженера на площадку Москва/Летняя 18 для проверки патч-панели и диагностики оптического модуля.',
    typeId: 'WFM',
    statusId: 'Opened',
    criticalityId: 'Important',
    productId: 'product-2',
    clientId: 'client-1',
    siteId: 'site-1',
    responsibleId: 'acc-emp-wfm-1',
    createdBy: 'acc-emp-ktp-1',
    updatedBy: 'acc-emp-wfm-1',
    createdAt: '2026-02-20T14:05:00.000Z',
    updatedAt: '2026-02-24T07:35:00.000Z',
    linkedTicketIds: ['appeal-1'],
    comments: [
      {
        id: 'comment-3',
        ticketId: 'appeal-3',
        isClosedComment: false,
        createdBy: 'acc-emp-wfm-1',
        authorName: 'Марк Громов',
        contents: 'Инженер на площадке с 11:00, ожидаем доступ в серверную.',
        createdAt: '2026-02-24T07:35:00.000Z',
        updatedAt: '2026-02-24T07:35:00.000Z',
        files: [],
      },
    ],
  },
  {
    id: 'appeal-4',
    title: 'CRM-1003',
    description:
      'Нужна консультация по добавлению новых внутренних номеров и перенастройке маршрутизации звонков.',
    typeId: 'KTP',
    statusId: 'Customer Pending',
    criticalityId: 'Basic',
    productId: 'product-3',
    clientId: 'client-1',
    siteId: 'site-2',
    responsibleId: 'acc-emp-ktp-1',
    createdBy: 'acc-rep-2',
    updatedBy: 'acc-emp-ktp-1',
    createdAt: '2026-02-22T11:15:00.000Z',
    updatedAt: '2026-02-24T06:45:00.000Z',
    linkedTicketIds: [],
    comments: [],
  },
  {
    id: 'appeal-5',
    title: 'Наряд-2002',
    description:
      'Плановая замена старого маршрутизатора на Router B2B Pro в Санкт-Петербурге.',
    typeId: 'WFM',
    statusId: 'Customer Pending',
    criticalityId: 'Basic',
    productId: 'product-2',
    clientId: 'client-2',
    siteId: 'site-3',
    responsibleId: 'acc-emp-wfm-1',
    createdBy: 'acc-emp-wfm-1',
    updatedBy: 'acc-emp-wfm-1',
    createdAt: '2026-02-10T08:00:00.000Z',
    updatedAt: '2026-02-23T16:20:00.000Z',
    linkedTicketIds: [],
    comments: [],
  },
]

const users: UserProfile[] = [
  {
    id: 'acc-emp-admin-1',
    fullName: 'Егор Власов',
    role: 'admin',
    position: 'Администратор CRM',
    phoneNumber: '+7 (900) 100-10-10',
    email: 'admin@ebko.local',
    image: '',
    login: 'admin',
  },
  {
    id: 'acc-emp-ktp-1',
    fullName: 'Илья Новиков',
    role: 'ktp',
    position: 'Оператор КТП',
    phoneNumber: '+7 (900) 101-10-10',
    email: 'ktp@ebko.local',
    image: '',
    login: 'ktp',
  },
  {
    id: 'acc-emp-wfm-1',
    fullName: 'Марк Громов',
    role: 'wfm',
    position: 'Инженер WFM',
    phoneNumber: '+7 (900) 102-10-10',
    email: 'wfm@ebko.local',
    image: '',
    login: 'wfm',
  },
  {
    id: 'acc-emp-ebko-1',
    fullName: 'Oleg Ebko',
    role: 'ebko',
    position: 'EBKO Director',
    phoneNumber: '+7 (900) 104-10-10',
    email: 'ebko@ebko.local',
    image: '',
    login: 'ebko',
  },
  {
    id: 'acc-rep-1',
    fullName: 'Ирина Смирнова',
    role: 'client',
    position: 'Представитель клиента',
    phoneNumber: '+7 (903) 111-11-11',
    email: 'i.smirnova@alpha-log.ru',
    image: '',
    login: 'client',
    clientId: 'client-1',
    representativeId: 'acc-rep-1',
  },
  {
    id: 'acc-rep-3',
    fullName: 'Дмитрий Поляков',
    role: 'client',
    position: 'Представитель клиента',
    phoneNumber: '+7 (911) 123-45-67',
    email: 'd.polyakov@severnet.ru',
    image: '',
    login: 'north',
    clientId: 'client-2',
    representativeId: 'acc-rep-3',
  },
]

const mockCredentialMap: Record<string, { password: string; userId: string }> = {
  admin: { password: 'admin', userId: 'acc-emp-admin-1' },
  ktp: { password: 'ktp', userId: 'acc-emp-ktp-1' },
  wfm: { password: 'wfm', userId: 'acc-emp-wfm-1' },
  client: { password: 'client', userId: 'acc-rep-1' },
  north: { password: 'north123', userId: 'acc-rep-3' },
  ebko: { password: 'ebko', userId: 'acc-emp-ebko-1' },
}

const dataset: CrmBootstrapData = {
  appeals,
  employees,
  clients,
  sites,
  equipment,
  users,
  products,
  equipmentTypes,
  ticketTypes,
  ticketStatuses,
  ticketCriticalities,
  reactions,
}

export function getMockBootstrapData(): CrmBootstrapData {
  return JSON.parse(JSON.stringify(dataset)) as CrmBootstrapData
}

export function findMockUserByCredentials(login: string, password: string): UserProfile | null {
  const credentials = mockCredentialMap[login]
  if (!credentials || credentials.password !== password) {
    return null
  }

  const user = users.find((item) => item.id === credentials.userId)
  if (!user) {
    return null
  }

  return JSON.parse(JSON.stringify(user)) as UserProfile
}
