import { beforeAll, describe, expect, it } from 'vitest';
import { Sunat } from '../../src/index.js';
import { emisorDemo, generarCertificadoPem } from '../integracion/apoyo.js';
import { ESCENARIOS } from './escenarios.js';
import { compararXml } from './normalizar.js';

const URL_GATEWAY = process.env.SUNAT_GATEWAY_URL ?? 'http://127.0.0.1:14220';
const TOKEN = process.env.SUNAT_GATEWAY_TOKEN ?? '';

async function gatewayDisponible(): Promise<boolean> {
  if (!TOKEN) return false;
  try {
    const respuesta = await fetch(`${URL_GATEWAY}/salud`, { signal: AbortSignal.timeout(2_000) });
    return respuesta.ok;
  } catch {
    return false;
  }
}

async function xmlDeGreenter(documento: Record<string, unknown>): Promise<string> {
  const { ruc, razonSocial, nombreComercial, domicilio } = emisorDemo;
  const respuesta = await fetch(`${URL_GATEWAY}/firmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token-interno': TOKEN },
    body: JSON.stringify({
      credenciales: { entorno: 'PRUEBA' },
      emisor: {
        ruc,
        razon_social: razonSocial,
        nombre_comercial: nombreComercial,
        ubigeo: domicilio.ubigeo,
        departamento: domicilio.departamento,
        provincia: domicilio.provincia,
        distrito: domicilio.distrito,
        direccion: domicilio.direccion,
        cod_local: domicilio.codigoLocal,
      },
      documento,
    }),
  });
  const cuerpo = (await respuesta.json()) as { xml?: string | null };
  if (!respuesta.ok || !cuerpo.xml) throw new Error(`gateway ${respuesta.status}: ${JSON.stringify(cuerpo)}`);
  return Buffer.from(cuerpo.xml, 'base64').toString('utf8');
}

const disponible = await gatewayDisponible();

describe.skipIf(!disponible)('xml frente a greenter', () => {
  let sunat: Sunat;

  beforeAll(() => {
    sunat = new Sunat({
      entorno: 'beta',
      emisor: emisorDemo,
      usuarioSol: 'sin-red',
      claveSol: 'sin-red',
      certificado: generarCertificadoPem(emisorDemo.ruc),
    });
  });

  it.each(ESCENARIOS.map((e) => [e.nombre, e] as const))(
    '%s',
    async (_nombre, { entrada, referencia }) => {
      const { xml } = sunat.preparar(entrada);
      expect(compararXml(xml, await xmlDeGreenter(referencia))).toEqual([]);
    },
    30_000,
  );

  it('la comparacion detecta un total alterado en la referencia', async () => {
    const { entrada, referencia } = ESCENARIOS[0]!;
    const totales = referencia.totales as Record<string, number>;
    const alterada = { ...referencia, totales: { ...totales, total: totales.total! + 1 } };
    const diferencias = compararXml(sunat.preparar(entrada).xml, await xmlDeGreenter(alterada));
    expect(diferencias.join('\n')).toContain('cbc:PayableAmount');
  }, 30_000);
});
