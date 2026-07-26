import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@11.0.0';
import { getRpInfo, bytesToBase64 } from '../../shared/webauthn-utils.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { origin, rpId } = getRpInfo(req, body.origin);

    if (body.step === 'begin') {
      const encoder = new TextEncoder();
      const options = await generateRegistrationOptions({
        rpName: 'Acceso Eventos',
        rpID: rpId,
        userID: encoder.encode(body.person_id),
        userName: body.person_name || 'Persona',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
      });

      const biometric = await base44.asServiceRole.entities.Biometric.create({
        accreditation_id: body.accreditation_id,
        person_id: body.person_id,
        person_name: body.person_name,
        challenge: options.challenge,
        status: 'pending',
      });

      return Response.json({ options, biometric_id: biometric.id });
    }

    if (body.step === 'finish') {
      const biometric = await base44.asServiceRole.entities.Biometric.get(body.biometric_id);
      if (!biometric) {
        return Response.json({ error: 'Registro biométrico no encontrado' }, { status: 404 });
      }

      const verification = await verifyRegistrationResponse({
        response: body.attestation_response,
        expectedChallenge: biometric.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        await base44.asServiceRole.entities.Biometric.delete(biometric.id);
        return Response.json({ error: 'La verificación de registro falló' }, { status: 400 });
      }

      const info = verification.registrationInfo;

      await base44.asServiceRole.entities.Biometric.update(biometric.id, {
        credential_id: info.credentialID,
        public_key: bytesToBase64(info.credentialPublicKey),
        counter: info.counter,
        status: 'active',
        challenge: '',
      });

      if (biometric.accreditation_id) {
        await base44.asServiceRole.entities.Accreditation.update(biometric.accreditation_id, {
          has_biometric: true,
        });
      }

      await base44.asServiceRole.entities.AuditLog.create({
        actor_name: user.full_name || user.email,
        actor_id: user.id,
        action: 'biometric-register',
        entity: 'Biometric',
        entity_id: biometric.id,
        detail: biometric.person_name,
      });

      return Response.json({ verified: true });
    }

    return Response.json({ error: 'Paso inválido' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}