import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DAYS_THRESHOLD = 7;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const threshold = new Date(now.getTime() + DAYS_THRESHOLD * 24 * 60 * 60 * 1000);

    // Fetch approved documents (service role to bypass RLS — scheduled task, no user context)
    const docs = await base44.asServiceRole.entities.Document.filter(
      { status: 'approved' },
      '-created_date',
      500
    );

    // Keep only those expiring within the threshold window and not yet notified
    const expiring = docs.filter((d) => {
      if (!d.expires_at) return false;
      if (d.expiry_notified_at) return false;
      const expiry = new Date(d.expires_at + 'T23:59:59');
      if (isNaN(expiry.getTime())) return false;
      return expiry >= now && expiry <= threshold;
    });

    let notified = 0;
    const errors = [];

    for (const doc of expiring) {
      try {
        let person = null;
        if (doc.person_id) {
          person = await base44.asServiceRole.entities.Person.get(doc.person_id);
        }
        if (!person || !person.email) continue;

        const expiryDate = new Date(doc.expires_at + 'T00:00:00').toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        const docLabel = doc.document_type || doc.original_name || 'Documento';
        const personName = person.full_name || 'Proveedor';

        const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f0fdf4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#047857,#065f46);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">AccreditEvent</h1>
<p style="margin:8px 0 0;color:#a7f3d0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Aviso de vencimiento</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="margin:0 0 20px;color:#0f172a;font-size:16px;line-height:1.6;">Hola <strong>${escapeHtml(personName)}</strong>,</p>
<p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.6;">Tu documento <strong style="color:#047857;">${escapeHtml(docLabel)}</strong> vence el <strong>${escapeHtml(expiryDate)}</strong>. Te quedan pocos días para renovarlo.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-radius:12px;border:1px solid #fde68a;margin-bottom:28px;">
<tr><td style="padding:24px;">
<p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">Recordá que los documentos vencidos impiden la acreditación en eventos. Por favor, subí la documentación renovada lo antes posible.</p>
</td></tr>
</table>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">Si ya lo renovaste, ignorá este mensaje.</p>
</td></tr>
<tr><td style="background-color:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">AccreditEvent · Sistema de acreditación de eventos</p>
</td></tr>
</table>
</td></tr>
</table></body></html>`;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: person.email,
          subject: `Tu documento "${docLabel}" vence pronto`,
          body: htmlBody,
        });

        await base44.asServiceRole.entities.Document.update(doc.id, {
          expiry_notified_at: now.toISOString(),
        });

        notified++;
      } catch (err) {
        errors.push({ doc_id: doc.id, error: err.message });
      }
    }

    return Response.json({
      notified,
      total_expiring: expiring.length,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}