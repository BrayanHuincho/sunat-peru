import { strToU8, zipSync } from 'fflate';
import forge from 'node-forge';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCertificado, ErrorValidacion } from '../errores.js';
import { cargarCertificado } from '../firma/index.js';
import type { ComprobanteEntrada, Emisor, OpcionesSunat } from '../tipos.js';
import { Sunat } from './index.js';

vi.mock('../firma/index.js', async (original) => {
  const modulo = await original<typeof import('../firma/index.js')>();
  return { ...modulo, cargarCertificado: vi.fn(modulo.cargarCertificado) };
});

const BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const PRODUCCION = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';

const emisor: Emisor = {
  ruc: '20131312955',
  razonSocial: 'EMPRESA DE PRUEBA SAC',
  domicilio: {
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    direccion: 'AV. PRUEBA 123',
  },
};

const entrada: ComprobanteEntrada = {
  tipo: '01',
  serie: 'F001',
  correlativo: 7,
  fechaEmision: '2026-03-10',
  preciosIncluyenIgv: true,
  cliente: { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE SAC' },
  items: [{ descripcion: 'Servicio', cantidad: '1', precioUnitario: '118.00', afectacion: '10' }],
};

let pem: string;

beforeAll(() => {
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = claves.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date('2020-01-01T00:00:00Z');
  certificado.validity.notAfter = new Date('2040-01-01T00:00:00Z');
  const sujeto = [{ name: 'commonName', value: 'PRUEBA' }];
  certificado.setSubject(sujeto);
  certificado.setIssuer(sujeto);
  certificado.sign(claves.privateKey, forge.md.sha256.create());
  pem = forge.pki.privateKeyToPem(claves.privateKey) + forge.pki.certificateToPem(certificado);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-10T15:00:00Z') });
  vi.mocked(cargarCertificado).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function opciones(fetch: typeof globalThis.fetch, extra: Partial<OpcionesSunat> = {}): OpcionesSunat {
  return {
    entorno: 'beta',
    emisor,
    usuarioSol: 'MODDATOS',
    claveSol: 'secreta-sol',
    certificado: pem,
    fetch,
    ...extra,
  };
}

function cdrZip(codigo: string, descripcion: string, notas: string[] = []): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:ar" xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
  ${notas.map((nota) => `<cbc:Note>${nota}</cbc:Note>`).join('')}
  <cac:DocumentResponse><cac:Response>
    <cbc:ReferenceID>F001-7</cbc:ReferenceID>
    <cbc:ResponseCode>${codigo}</cbc:ResponseCode>
    <cbc:Description>${descripcion}</cbc:Description>
  </cac:Response></cac:DocumentResponse>
</ar:ApplicationResponse>`;
  return zipSync({ 'R-20131312955-01-F001-7.xml': strToU8(xml) });
}

function respuestaConZip(zip: Uint8Array): Response {
  const base64 = Buffer.from(zip).toString('base64');
  return new Response(
    `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body><br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${base64}</applicationResponse></br:sendBillResponse></soap-env:Body></soap-env:Envelope>`,
    { status: 200, headers: { 'content-type': 'text/xml' } },
  );
}

function respuestaFault(codigo: string, mensaje: string): Response {
  return new Response(
    `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body><soap-env:Fault><faultcode>soap-env:Client.${codigo}</faultcode><faultstring>${mensaje}</faultstring></soap-env:Fault></soap-env:Body></soap-env:Envelope>`,
    { status: 500, headers: { 'content-type': 'text/xml' } },
  );
}

const fetchQueDevuelve = (crear: () => Response) => vi.fn<typeof globalThis.fetch>(async () => crear());

const fetchQueNoResponde = () =>
  vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
      }),
  );

describe('enviar', () => {
  it('devuelve aceptado con el CDR y los datos del comprobante', async () => {
    const zip = cdrZip('0', 'La Factura ha sido aceptada');
    const fetch = fetchQueDevuelve(() => respuestaConZip(zip));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({
      estado: 'aceptado',
      reintentable: false,
      codigo: '0',
      descripcion: 'La Factura ha sido aceptada',
      nombreArchivo: '20131312955-01-F001-7',
    });
    expect(resultado.cdrZip).toEqual(zip);
    expect(resultado.xml).toContain('DigestValue');
    expect(resultado.qr).toBe(`20131312955|01|F001|000007|18.00|118.00|2026-03-10|6|20100066603|${resultado.hash}`);
  });

  it('autentica con RUC más usuario SOL contra el endpoint de beta', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

    await new Sunat(opciones(fetch)).enviar(entrada);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(BETA);
    expect(String(init?.body)).toContain('20131312955MODDATOS');
    expect(String(init?.body)).toContain('20131312955-01-F001-7.zip');
  });

  it('devuelve observado por código 4000 o más', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('4287', 'Dato observado', ['4287 - Dato observado'])));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({
      estado: 'observado',
      reintentable: false,
      codigo: '4287',
      notas: ['4287 - Dato observado'],
    });
  });

  it('devuelve observado cuando el código es 0 pero hay observaciones en las notas', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'Aceptada', ['4287 - Dato observado'])));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({
      estado: 'observado',
      reintentable: false,
    });
  });

  it('devuelve rechazado cuando el CDR trae un código 2000-3999', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('2335', 'Documento alterado')));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'rechazado', reintentable: false, codigo: '2335' });
    expect(resultado.cdrZip).not.toBeNull();
  });

  it('devuelve rechazado cuando el fault trae un código 2000-3999', async () => {
    const fetch = fetchQueDevuelve(() => respuestaFault('2800', 'Documento de cliente inválido'));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({
      estado: 'rechazado',
      reintentable: false,
      cdrZip: null,
    });
  });

  it('trata el duplicado 1033 como error no reintentable y lo explica', async () => {
    const fetch = fetchQueDevuelve(() => respuestaFault('1033', 'El comprobante fue registrado previamente'));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: false, codigo: '1033' });
    expect(resultado.descripcion).toContain('ya fue informado a SUNAT');
  });

  it('marca como reintentable un fault transitorio', async () => {
    const fetch = fetchQueDevuelve(() => respuestaFault('0130', 'Servicio no disponible'));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({ estado: 'error', reintentable: true });
  });

  it('no reintenta un error de credenciales', async () => {
    const fetch = fetchQueDevuelve(() => respuestaFault('0102', 'Usuario o clave incorrectos'));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: false });
    expect(resultado.descripcion).toContain('credenciales SOL');
  });

  it('no reintenta un fault de código desconocido', async () => {
    const fetch = fetchQueDevuelve(() => respuestaFault('1001', 'Otro problema'));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({ estado: 'error', reintentable: false });
  });

  it('devuelve error reintentable cuando vence el tiempo límite', async () => {
    const fetch = fetchQueNoResponde();

    const resultado = await new Sunat(opciones(fetch, { tiempoLimiteMs: 20 })).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: true, cdrZip: null });
    expect(resultado.xml).toContain('DigestValue');
  });

  it('devuelve error reintentable cuando falla la red', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({ estado: 'error', reintentable: true });
  });

  it('conserva el zip y el XML y no reintenta cuando el CDR es ilegible', async () => {
    const zip = zipSync({ 'otro.txt': strToU8('x') });
    const fetch = fetchQueDevuelve(() => respuestaConZip(zip));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: false, codigo: 'CDR_INVALIDO' });
    expect(resultado.cdrZip).toEqual(zip);
    expect(resultado.xml).toContain('DigestValue');
  });

  it('trata como error un CDR con código duplicado aunque leerCdr diga rechazado', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('1033', 'Registrado previamente')));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: false, codigo: '1033' });
    expect(resultado.cdrZip).not.toBeNull();
  });

  it.each([
    [503, true],
    [429, true],
    [408, true],
    [401, true],
    [404, false],
  ])('HTTP %i sin SOAP se reporta con reintentable %s', async (status, reintentable) => {
    const fetch = fetchQueDevuelve(() => new Response('<html></html>', { status }));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({
      estado: 'error',
      reintentable,
      codigo: `HTTP_${status}`,
    });
  });

  it('no firma con un certificado vencido', () => {
    const sunat = new Sunat(opciones(fetchQueDevuelve(() => new Response(''))));
    vi.useFakeTimers({ now: new Date('2099-01-01T00:00:00Z') });
    try {
      expect(() => sunat.preparar(entrada)).toThrow(ErrorCertificado);
    } finally {
      vi.useRealTimers();
    }
  });

  it('en producción un HTTP 401 no se reintenta', async () => {
    const fetch = fetchQueDevuelve(() => new Response('<html></html>', { status: 401 }));

    expect(await new Sunat(opciones(fetch, { entorno: 'produccion' })).enviar(entrada)).toMatchObject({
      estado: 'error',
      reintentable: false,
    });
  });

  it('avisa del posible 1033 cuando la respuesta no es SOAP', async () => {
    const fetch = fetchQueDevuelve(() => new Response('no soy xml', { status: 200 }));

    const resultado = await new Sunat(opciones(fetch)).enviar(entrada);

    expect(resultado).toMatchObject({ estado: 'error', reintentable: true, codigo: 'RESPUESTA_INVALIDA' });
    expect(resultado.descripcion).toContain('1033');
  });

  it('reintenta un faultcode no numérico', async () => {
    const cuerpo =
      '<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body><soap-env:Fault><faultcode>env:Server</faultcode><faultstring>Error interno</faultstring></soap-env:Fault></soap-env:Body></soap-env:Envelope>';
    const fetch = fetchQueDevuelve(() => new Response(cuerpo, { status: 500 }));

    expect(await new Sunat(opciones(fetch)).enviar(entrada)).toMatchObject({ estado: 'error', reintentable: true });
  });

  it('lanza ErrorValidacion sin tocar la red', async () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

    await expect(new Sunat(opciones(fetch)).enviar({ ...entrada, items: [] })).rejects.toBeInstanceOf(ErrorValidacion);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('preparar', () => {
  it('firma sin tocar la red', () => {
    const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

    const preparado = new Sunat(opciones(fetch)).preparar(entrada);

    expect(fetch).not.toHaveBeenCalled();
    expect(preparado.nombreArchivo).toBe('20131312955-01-F001-7');
    expect(preparado.hash).not.toBe('');
    expect(preparado.xml).toContain(preparado.hash);
    expect(preparado.qr.endsWith(`|${preparado.hash}`)).toBe(true);
  });

  it('valida la fecha con el día de Lima y no con el de UTC', () => {
    vi.setSystemTime(new Date('2026-03-11T03:00:00Z'));
    const sunat = new Sunat(opciones(fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')))));

    expect(() => sunat.preparar({ ...entrada, fechaEmision: '2026-03-11' })).toThrow(ErrorValidacion);
  });
});

describe('configuración', () => {
  const fetch = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

  it('usa el endpoint de producción solo en producción', async () => {
    const llamada = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

    await new Sunat(opciones(llamada, { entorno: 'produccion' })).enviar(entrada);

    expect(String(llamada.mock.calls[0]?.[0])).toBe(PRODUCCION);
  });

  it('rechaza un endpoint de producción en beta', () => {
    expect(() => new Sunat(opciones(fetch, { endpoint: PRODUCCION }))).toThrow(ErrorValidacion);
    expect(() => new Sunat(opciones(fetch, { endpoint: 'https://E-FACTURA.sunat.gob.pe/otra/ruta' }))).toThrow(
      ErrorValidacion,
    );
  });

  it('rechaza un endpoint de beta en producción', () => {
    expect(() => new Sunat(opciones(fetch, { entorno: 'produccion', endpoint: BETA }))).toThrow(ErrorValidacion);
  });

  it('acepta un endpoint propio que no es del entorno contrario', async () => {
    const llamada = fetchQueDevuelve(() => respuestaConZip(cdrZip('0', 'ok')));

    await new Sunat(opciones(llamada, { endpoint: 'http://localhost:9000/bill' })).enviar(entrada);

    expect(String(llamada.mock.calls[0]?.[0])).toBe('http://localhost:9000/bill');
  });

  it('rechaza un entorno inválido en vez de asumir uno', () => {
    expect(() => new Sunat(opciones(fetch, { entorno: 'BETA' as OpcionesSunat['entorno'] }))).toThrow(ErrorValidacion);
  });

  it('carga el certificado una sola vez', async () => {
    const sunat = new Sunat(opciones(fetch));

    sunat.preparar(entrada);
    await sunat.enviar(entrada);
    await sunat.enviar(entrada);

    expect(cargarCertificado).toHaveBeenCalledTimes(1);
  });

  it('falla al construir si el certificado no sirve', () => {
    expect(() => new Sunat(opciones(fetch, { certificado: 'no es un certificado' }))).toThrow(ErrorCertificado);
  });

  it('no expone secretos al serializar', () => {
    const texto = JSON.stringify(new Sunat(opciones(fetch)));

    expect(texto).not.toContain('secreta-sol');
    expect(texto).not.toContain('PRIVATE KEY');
  });
});
