import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'npm:@simplewebauthn/server@11.0.0';
import { getRpInfo, base64ToBytes } from '../../shared/webauthn-utils.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { origin, rpId } = getRpInfo(req, body.origin);

    const biometrics = await base44.asServiceRole.entities.Biometric.filter({
      accreditation_id: body.accreditation_id,
      status: 'active',
    });
    const biometric = biometrics[0];
    if (!biometric) {
      return Response.json({ error: 'Sin credencial biométrica registrada' }, { status: 404 });
    }

    if (body.step === 'begin') {
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials: [{
          id: biometric.credential_id,
          type: 'public-key',
        }],
        userVerification: 'required',
      });

      await base44.asServiceRole.entities.Biometric.update(biometric.id, {
        challenge: options.challenge,
      });

      return Response.json({ options });
    }

    if (body.step === 'finish') {
      const verification = await verifyAuthenticationResponse({
        response: body.assertion_response,
        expectedChallenge: biometric.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: {
          id: biometric.credential_id,
          publicKey: base64ToBytes(biometric.public_key),
          counter: biometric.counter,
        },
      });

      if (!verification.verified) {
        return Response.json({ error: 'Verificación biométrica fallida' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Biometric.update(biometric.id, {
        counter: verification.authenticationInfo.newCounter,
        challenge: '',
      });

      const accessLog = await base44.asServiceRole.entities.AccessLog.create({
        accreditation_id: body.accreditation_id,
        person_name: body.person_name,
        badge_code: body.badge_code,
        event_name: body.event_name,
        verified_by: body.verified_by,
        method: 'biometric',
      });

      await base44.asServiceRole.entities.AuditLog.create({
        actor_name: body.verified_by,
        actor_id: user.id,
        action: 'access-biometric',
        entity: 'AccessLog',
        entity_id: accessLog.id,
        detail: body.person_name,
      });

      return Response.json({ verified: true, access_log_id: accessLog.id });
    }

    return Response.json({ error: 'Paso inválido' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}