import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getRpInfo, base64ToBytes } from '../shared/webauthn-utils.js';

export async function webauthnVerify(body, { user, prisma }) {
  if (!user) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const { origin, rpId } = getRpInfo({ headers: body._headers || {} }, body.origin);
  const biometrics = await prisma.biometric.findMany({ where: { accreditation_id: body.accreditation_id, status: 'active' } });
  const biometric = biometrics[0];
  if (!biometric) throw Object.assign(new Error('Sin credencial biométrica registrada'), { status: 404 });

  if (body.step === 'begin') {
    const options = await generateAuthenticationOptions({ rpID: rpId, allowCredentials: [{ id: biometric.credential_id, type: 'public-key' }], userVerification: 'required' });
    await prisma.biometric.update({ where: { id: biometric.id }, data: { challenge: options.challenge } });
    return { options };
  }
  if (body.step === 'finish') {
    const verification = await verifyAuthenticationResponse({ response: body.assertion_response, expectedChallenge: biometric.challenge, expectedOrigin: origin, expectedRPID: rpId, credential: { id: biometric.credential_id, publicKey: base64ToBytes(biometric.public_key), counter: biometric.counter } });
    if (!verification.verified) throw Object.assign(new Error('Verificación biométrica fallida'), { status: 400 });
    await prisma.biometric.update({ where: { id: biometric.id }, data: { counter: verification.authenticationInfo.newCounter, challenge: null } });
    const accessLog = await prisma.accessLog.create({ data: { accreditation_id: body.accreditation_id, person_name: body.person_name, badge_code: body.badge_code, event_name: body.event_name, verified_by: body.verified_by, method: 'biometric', created_by_id: user.id } });
    await prisma.auditLog.create({ data: { actor_name: body.verified_by, actor_id: user.id, action: 'access-biometric', entity: 'AccessLog', entity_id: accessLog.id, detail: body.person_name } });
    return { verified: true, access_log_id: accessLog.id };
  }
  throw Object.assign(new Error('Paso inválido'), { status: 400 });
}