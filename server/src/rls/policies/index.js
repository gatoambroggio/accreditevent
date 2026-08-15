// Políticas RLS del slice — espejo de los jsonc de Base44. Mismo $or/$and/
// user_condition y referencias {{user.data.*}}. El motor las traduce a Prisma.

export const policies = {
  Event: {
    read: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { id: { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    create: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
      ],
    },
    update: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { id: { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    delete: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
      ],
    },
  },

  Person: {
    read: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { 'data.email': '{{user.email}}' },
        { created_by_id: '{{user.id}}' },
      ],
    },
    create: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { user_condition: { role: 'provider' } },
      ],
    },
    update: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { 'data.email': '{{user.email}}' },
        { created_by_id: '{{user.id}}' },
      ],
    },
    delete: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.productora': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'empresa' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
  },

  Accreditation: {
    read: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { 'data.person_email': '{{user.email}}' },
      ],
    },
    create: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    update: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    delete: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
  },

  Vehicle: {
    read: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
    create: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    update: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
    delete: {
      $or: [
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_ids': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
  },

  AccessLog: {
    read: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { user_condition: { role: 'control' } },
        { user_condition: { role: 'pda' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    create: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { user_condition: { role: 'control' } },
        { user_condition: { role: 'pda' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    update: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
    delete: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
      ],
    },
  },

  AccessLevel: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }] }, update: {}, delete: {} },

  ParkingSector: { read: {}, create: {}, update: {}, delete: {} },

  SystemSetting: { read: {}, create: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] }, update: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] }, delete: { $or: [{ user_condition: { role: 'productora' } }, { user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }] } },

  PdaStation: {
    read: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { 'data.assigned_event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { user_condition: { role: 'productora' } }, { user_condition: { role: 'operador' } }, { user_condition: { role: 'control' } }, { user_condition: { role: 'pda' } }] },
    update: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { $and: [{ user_condition: { role: 'pda' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }] },
  },

  Biometric: {
    read: {
      $or: [
        { user_condition: { role: 'superadmin' } },
        { user_condition: { role: 'admin' } },
        { user_condition: { role: 'coordinator' } },
        { user_condition: { role: 'control' } },
        { user_condition: { role: 'pda' } },
        { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] },
        { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } },
        { created_by_id: '{{user.id}}' },
      ],
    },
    create: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }] },
    update: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' }] },
    delete: { $or: [{ user_condition: { role: 'superadmin' } }, { user_condition: { role: 'admin' } }, { user_condition: { role: 'coordinator' } }, { $and: [{ user_condition: { role: 'productora' } }, { 'data.company': '{{user.data.company}}' }] }, { 'data.event_id': { $in: '{{user.data.assigned_event_ids}}' } }, { created_by_id: '{{user.id}}' }] },
  },
};