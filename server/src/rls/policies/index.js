// Políticas RLS completas — espejo de TODOS los jsonc de Base44.

export const policies = {
  Event: {
    read: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { id: { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    create: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
    ] },
    update: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { id: { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    delete: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
    ] },
  },

  Person: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.email': '{{user.email}}' }, { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { user_condition: { role: 'provider' } },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.email': '{{user.email}}' }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { created_by_id: '{{user.id}}' },
    ] },
  },

  Accreditation: {
    read: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.person_email': '{{user.email}}' },
    ] },
    create: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'empresa' } },
    ] },
    update: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'empresa' } },
    ] },
    delete: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
  },

  Vehicle: {
    read: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'provider' } },
    ] },
    update: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
  },

  AccessLog: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
  },

  AccessLevel: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] } },
  ParkingSector: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] } },
  DocumentType: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] } },
  RequirementItem: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] } },
  CustomField: { read: {}, create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'productora' } }] }, update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'productora' } }] }, delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'productora' } }] } },

  SystemSetting: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] } },

  PdaStation: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.assigned_event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { user_condition: { role: 'productora' } }, { user_condition: { role: 'operador' } }, { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } }] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'operador' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'control' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
    ] },
  },

  Biometric: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'provider' } },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
  },

  DahuaDevice: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
  },
  DahuaCommand: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
  },
  ZKTecoDevice: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
  },
  ZKTecoCommand: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
  },

  ProviderCompany: {
    read: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'empresa' } }, { 'data.name': '{{user.data.company}}' }] }] },
    create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] },
    update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'empresa' } }, { 'data.name': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] },
  },

  Document: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'provider' } },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
    ] },
  },

  EventCompanyApproval: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { $and: [{ user_condition: { role: 'empresa' } }, { 'data.provider_company': '{{user.data.company}}' }] },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },

  ProviderRequest: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.person_email': '{{user.email}}' }, { created_by_id: '{{user.id}}' },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { user_condition: { role: 'provider' } },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { 'data.person_email': '{{user.email}}' }, { created_by_id: '{{user.id}}' },
    ] },
    delete: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { 'data.person_email': '{{user.email}}' }, { created_by_id: '{{user.id}}' },
    ] },
  },

  AuditLog: {
    read: { $or: [{ user_condition: { role: 'admin' } }, { user_condition: { role: 'superadmin' } }] },
    create: { $or: [{ created_by_id: '{{user.id}}' }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'coordinator' } }, { user_condition: { role: 'control' } }, { user_condition: { role: 'provider' } }] },
    update: { $or: [{ user_condition: { role: 'admin' } }, { user_condition: { role: 'superadmin' } }] },
    delete: { $or: [{ user_condition: { role: 'admin' } }, { user_condition: { role: 'superadmin' } }] },
  },

  PendingOperator: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'productora' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
  },

  Company: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { user_condition: { role: 'productora' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
  },

  User: { // solo admins listan/editan otros usuarios
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { id: '{{user.id}}' }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { id: '{{user.id}}' }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] },
  },

  // ─── Venta de entradas (ticketera) ───
  TicketType: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  TicketSale: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  Ticket: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { 'data.buyer_email': '{{user.email}}' },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },

  // ─── Barras (POS) ───
  Bar: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { id: '{{user.data.bar_id}}' }] },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { $and: [{ user_condition: { role: 'barra' } }, { id: '{{user.data.bar_id}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  BarProduct: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
  },
  EventProduct: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.event_id': '{{user.data.bar_event_id}}' }] },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  BarSale: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { created_by_id: '{{user.id}}' },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } }, { user_condition: { role: 'operador' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ]},
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  BarOperator: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  BarTablet: {
    read: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] },
  },
  BarPosDevice: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ] },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
  BarCashMovement: {
    read: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ] },
    create: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } }, { user_condition: { role: 'operador' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ] },
    update: { $or: [
      { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } },
      { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
      { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      { $and: [{ user_condition: { role: 'barra' } }, { 'data.bar_id': '{{user.data.bar_id}}' }] },
    ]},
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },
};