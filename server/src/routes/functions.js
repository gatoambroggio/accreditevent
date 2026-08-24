import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { recognize } from '../functions/readPatente.js';
import { readDni } from '../functions/readDni.js';
import { getEventAccessData } from '../functions/getEventAccessData.js';
import { faceIdentify } from '../functions/faceIdentify.js';
import { faceVerify } from '../functions/faceVerify.js';
import { checkFaceDuplicate } from '../functions/checkFaceDuplicate.js';
import { cleanupBiometrics } from '../functions/cleanupBiometrics.js';
import { clearBiometrics } from '../functions/clearBiometrics.js';
import { validateInsurance } from '../functions/validateInsurance.js';
import { checkPersonDocuments } from '../functions/checkPersonDocuments.js';
import { checkDocumentDuplicate } from '../functions/checkDocumentDuplicate.js';
import { reviewDocument } from '../functions/reviewDocument.js';
import { notifyExpiringDocuments } from '../functions/notifyExpiringDocuments.js';
import { createDocument } from '../functions/createDocument.js';
import { deleteDocuments } from '../functions/deleteDocuments.js';
import { uploadDocumentBase64 } from '../functions/uploadDocumentBase64.js';
import { createUser } from '../functions/createUser.js';
import { changeUserPassword } from '../functions/changeUserPassword.js';
import { assignOperator } from '../functions/assignOperator.js';
import { updateOperator } from '../functions/updateOperator.js';
import { getCompanyOperators } from '../functions/getCompanyOperators.js';
import { getOperatorModules } from '../functions/getOperatorModules.js';
import { updateCompanyOperatorModules } from '../functions/updateCompanyOperatorModules.js';
import { processPendingOperators } from '../functions/processPendingOperators.js';
import { empresaSetup } from '../functions/empresaSetup.js';
import { providerSetup } from '../functions/providerSetup.js';
import { saveProviderBiometric } from '../functions/saveProviderBiometric.js';
import { getEmpresaEmployeeStatus } from '../functions/getEmpresaEmployeeStatus.js';
import { getCompanyEvents } from '../functions/getCompanyEvents.js';
import { getProductoraDocuments } from '../functions/getProductoraDocuments.js';
import { deletePerson } from '../functions/deletePerson.js';
import { cleanupDatabase } from '../functions/cleanupDatabase.js';
import { closeExpiredEvents } from '../functions/closeExpiredEvents.js';
import { dahuaSyncUsers } from '../functions/dahuaSyncUsers.js';
import { dahuaRemoteAction } from '../functions/dahuaRemoteAction.js';
import { webauthnRegister } from '../functions/webauthnRegister.js';
import { webauthnVerify } from '../functions/webauthnVerify.js';
import { exportData } from '../functions/exportData.js';
import { manageBarOperator } from '../functions/manageBarOperator.js';
import { afipIssue } from '../functions/afipIssue.js';
import { afipSyncPending } from '../functions/afipSyncPending.js';
import { afipRetry } from '../functions/afipRetry.js';
import { readDniPdf417 } from '../functions/readDniPdf417.js';

export const functionInvokeRouter = Router();

// Dispatcher de las 38 funciones — mismo contrato que base44.functions.invoke(name, payload).
const handlers = {
  readPatente: async (p) => recognize(p.file_url || p.fileUrl, p),
  readDni: async (p) => readDni({ file_url: p.file_url || p.fileUrl }),
  getEventAccessData, faceIdentify, faceVerify, checkFaceDuplicate, cleanupBiometrics, clearBiometrics,
  validateInsurance, checkPersonDocuments, checkDocumentDuplicate, reviewDocument, notifyExpiringDocuments,
  createDocument, deleteDocuments, uploadDocumentBase64,
  createUser, changeUserPassword, assignOperator, updateOperator, getCompanyOperators, getOperatorModules,
  updateCompanyOperatorModules, processPendingOperators,
  empresaSetup, providerSetup, saveProviderBiometric, getEmpresaEmployeeStatus, getCompanyEvents, getProductoraDocuments,
  deletePerson, cleanupDatabase, closeExpiredEvents,
  dahuaSyncUsers, dahuaRemoteAction, webauthnRegister, webauthnVerify,
  exportData,
  manageBarOperator,
  afipIssue, afipSyncPending, afipRetry,
  readDniPdf417: async (p) => readDniPdf417({ file_url: p.file_url || p.fileUrl }),
};

functionInvokeRouter.post('/:name', async (req, res, next) => {
  try {
    const handler = handlers[req.params.name];
    if (!handler) return res.status(404).json({ error: `Función no encontrada: ${req.params.name}` });
    const payload = { ...req.body };
    // Para webauthn: pasar headers para resolver origin
    if (req.params.name === 'webauthnRegister' || req.params.name === 'webauthnVerify') payload._headers = req.headers;
    const out = await handler(payload, { user: req.user, prisma });
    res.json({ data: out });
  } catch (e) { console.error(`[function ${req.params.name}]`, e.message); res.status(e.status || 500).json({ error: e.message }); }
});