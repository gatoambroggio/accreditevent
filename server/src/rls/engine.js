// Motor de RLS: traduce las reglas de los jsonc ($or, $and, user_condition,
// "data.campo": "{{user.data.x}}", "$in") a un filtro Prisma `where`.

import { prisma } from '../db/prisma.js';
import { policies } from './policies/index.js';

function resolveTemplate(tpl, user) {
  if (typeof tpl !== 'string') return tpl;
  const m = tpl.match(/^{{user\.(.+)}}$/);
  if (!m) return tpl;
  const path = m[1].split('.');
  let v = user;
  for (const p of path) { v = v?.[p]; }
  return v;
}

function fieldFromKey(key) {
  if (key.startsWith('data.')) return key.slice(5);
  return key;
}

function evalClause(clause, user) {
  const ands = [];
  let satisfied = false;
  let hasFilter = false;

  for (const [key, val] of Object.entries(clause)) {
    if (key === 'user_condition') {
      const ok = Object.entries(val).every(([k, v]) => {
        const uval = k === 'role' ? user.role : k === 'id' ? user.id : k === 'email' ? user.email : user.data?.[k];
        return uval === v;
      });
      if (!ok) return {};
      satisfied = true;
    } else if (key === '$or') {
      const subs = val.map((c) => evalClause(c, user));
      if (subs.includes(null)) { satisfied = true; }
      else {
        const filtered = subs.filter((s) => s && Object.keys(s).length);
        if (filtered.length === 0) return {};
        ands.push(filtered.length === 1 ? filtered[0] : { OR: filtered });
        hasFilter = true;
      }
    } else if (key === '$and') {
      const subs = val.map((c) => evalClause(c, user));
      if (subs.some((s) => s && Object.keys(s).length === 0)) return {};
      if (subs.includes(null)) satisfied = true;
      const filtered = subs.filter((s) => s && s !== null && Object.keys(s).length);
      if (filtered.length) { ands.push({ AND: filtered }); hasFilter = true; }
    } else {
      const field = fieldFromKey(key);
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const [op, operand] of Object.entries(val)) {
          const resolved = resolveTemplate(operand, user);
          if (op === '$in') ands.push({ [field]: { in: resolved || [] } });
          else if (op === '$eq') ands.push({ [field]: resolved });
          else if (op === '$ne') ands.push({ NOT: { [field]: resolved } });
          hasFilter = true;
        }
      } else {
        ands.push({ [field]: resolveTemplate(val, user) });
        hasFilter = true;
      }
    }
  }

  if (!hasFilter && satisfied) return null;
  if (!hasFilter) return {};
  return ands.length === 1 ? ands[0] : { AND: ands };
}

export function buildWhere(policy, user) {
  if (!policy || Object.keys(policy).length === 0) return null;
  if (policy.$or) {
    const results = policy.$or.map((c) => evalClause(c, user));
    if (results.includes(null)) return null;
    const filtered = results.filter((r) => r && Object.keys(r).length);
    if (filtered.length === 0) return {};
    return { OR: filtered };
  }
  if (policy.$and) return evalClause({ $and: policy.$and }, user);
  return evalClause(policy, user);
}

export function canAccess(policy, user, record) {
  const where = buildWhere(policy, user);
  if (where === null) return true;
  return matchesWhere(where, record);
}

function matchesWhere(where, record) {
  if (!where || Object.keys(where).length === 0) return Object.keys(where).length === 0;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') return v.some((sub) => matchesWhere(sub, record));
    if (k === 'AND') return v.every((sub) => matchesWhere(sub, record));
    if (k === 'NOT') return !matchesWhere(v, record);
    const rv = record?.[k];
    if (v && typeof v === 'object' && 'in' in v) {
      if (!Array.isArray(v.in) || !v.in.includes(rv)) return false;
    } else if (rv !== v) return false;
  }
  return true;
}

const ENTITY_TO_MODEL = {
  Event: 'event', Person: 'person', Accreditation: 'accreditation',
  Vehicle: 'vehicle', AccessLog: 'accessLog', AccessLevel: 'accessLevel',
  Company: 'company', SystemSetting: 'systemSetting', ParkingSector: 'parkingSector',
  PdaStation: 'pdaStation', Biometric: 'biometric', User: 'user',
  DahuaDevice: 'dahuaDevice', DahuaCommand: 'dahuaCommand',
  ZKTecoDevice: 'zkTecoDevice', ZKTecoCommand: 'zkTecoCommand',
  ProviderCompany: 'providerCompany', Document: 'document', DocumentType: 'documentType',
  CustomField: 'customField', EventCompanyApproval: 'eventCompanyApproval',
  ProviderRequest: 'providerRequest', RequirementItem: 'requirementItem',
  AuditLog: 'auditLog', PendingOperator: 'pendingOperator',
  Ticket: 'ticket', TicketType: 'ticketType', TicketSale: 'ticketSale',
  // Barras (POS)
  Bar: 'bar', BarProduct: 'barProduct', EventProduct: 'eventProduct',
  BarSale: 'barSale', BarOperator: 'barOperator', BarTablet: 'barTablet',
  BarPosDevice: 'barPosDevice', BarCashMovement: 'barCashMovement',
};

export function getModel(name) {
  const model = ENTITY_TO_MODEL[name];
  if (!model) throw new Error(`Entidad no soportada por RLS: ${name}`);
  return prisma[model];
}

export function getPolicy(entityName, op) {
  const p = policies[entityName];
  if (!p) return null;
  return p[op] ?? null;
}

export function mergeWhere(userWhere, rlsWhere) {
  if (rlsWhere === null) return userWhere || {};
  if (!userWhere || Object.keys(userWhere).length === 0) return rlsWhere;
  return { AND: [userWhere, rlsWhere] };
}