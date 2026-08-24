export default async function () {
  return Response.json(
    { error: 'La facturación AFIP requiere el servidor self-hosted (certificado en disco + salida a afip.gob.ar). No se puede reintentar CAE desde la nube Base44.' },
    { status: 501 }
  );
}