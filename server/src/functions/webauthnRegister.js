import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { getRpInfo, bytesToBase64 } from '../shared/webauthn-utils.js';

export async function webauthnRegister(body, { user, prisma }) {
  if (!user) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const { origin, rpId } = getRpInfo({ headers: body._headers || {} }, body.origin);
  if (body.step === 'begin') {
    const encoder = new TextEncoder();
    const options = await generateRegistrationOptions({ rpName: 'Acceso Eventos', rpID: rpId, userID: encoder.encode(body.person_id), userName: body.person_name || 'Persona', authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' } });
    const biometric = await prisma.biometric.create({ data: { accreditation_id: body.accreditation_id || null, person_id: body.person_id, person_name: body.person_name, challenge: options.challenge, status: 'pending', face_descriptor: [] } });
    return { options, biometric_id: biometric.id };
  }
  if (body.step === 'finish') {
    const biometric = await prisma.biometric.findUnique({ where: { id: body.biometric_id } });
    if (!biometric) throw Object.assign(new Error('Registro biométrico no encontrado'), { status: 404 });
    const verification = await verifyRegistrationResponse({ response: body.attestation_response, expectedChallenge: biometric.challenge, expectedOrigin: origin, expectedRPID: rpId });
    if (!verification.verified || !verification.registrationInfo) { await prisma.biometric.delete({ where: { id: biometric.id } }); throw Object.assign(new Error('La verificación de registro falló'), { status: 400 }); }
    const info = verification.registrationInfo;
    await prisma.biometric.update({ where: { id: biometric.id }, data: { credential_id: info.credentialID, public_key: bytesToBase64(info.credentialPublicKey), counter: info.counter, status: 'active', challenge: null } });
    if (biometric.accreditation_id) await prisma.accreditation.update({ where: { id: biometric.accreditation_id }, data: { has_biometric: true } }).catch(() => {});
    await prisma.auditLog.create({ data: { actor_name: user.full_name || user.email, actor_id: user.id, action: 'biometric-register', entity: 'Biometric', entity_id: biometric.id, detail: biometric.person_name } });
    return { verified: true };
  }
  throw Object.assign(new Error('Paso inválido'), { status: 400 });
}