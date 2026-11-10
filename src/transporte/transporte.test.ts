import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorTransporte } from '../errores.js';
import type { CredencialesSol } from '../tipos.js';
import { comprimirXml, endpointPara, enviarZip } from './index.js';

const credenciales: CredencialesSol = { ruc: '20000000001', usuario: 'MODDATOS', clave: 'cl<av&e' };
const zip = new Uint8Array([1, 2, 3]);
const endpoint = 'https://sunat.test/billService';

function sobreFault(faultcode: string, faultstring: string): string {
  return `<?xml version="1.0"?><soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body><soap-env:Fault><faultcode>${faultcode}</faultcode><faultstring>${faultstring}</faultstring></soap-env:Fault></soap-env:Body></soap-env:Envelope>`;
}

function sobreCdr(base64: string): string {
  return `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${base64}</applicationResponse></br:sendBillResponse></S:Body></S:Envelope>`;
}

function fetchCon(cuerpo: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(cuerpo, { status }));
}

function enviar(hacerFetch: typeof fetch, tiempoLimiteMs?: number) {
  return enviarZip({ endpoint, credenciales, nombreZip: 'a.zip', zip, fetch: hacerFetch, tiempoLimiteMs });
}

async function fallo(promesa: Promise<unknown>): Promise<ErrorTransporte> {
  const error = await promesa.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ErrorTransporte);
  return error as ErrorTransporte;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('endpointPara', () => {
  it('devuelve la url de cada entorno', () => {
    expect(endpointPara('beta')).toBe('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService');
    expect(endpointPara('produccion')).toBe('https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService');
  });
});

describe('comprimirXml', () => {
  it('crea un zip con una sola entrada xml', () => {
    const entradas = unzipSync(comprimirXml('20000000001-01-F001-1', '<a>ñ</a>'));
    expect(Object.keys(entradas)).toEqual(['20000000001-01-F001-1.xml']);
    expect(strFromU8(entradas['20000000001-01-F001-1.xml']!)).toBe('<a>ñ</a>');
  });

  it('no duplica la extensión', () => {
    expect(Object.keys(unzipSync(comprimirXml('a.xml', '<a/>')))).toEqual(['a.xml']);
  });
});

describe('enviarZip: petición', () => {
  it('arma el sobre SOAP 1.1 como Greenter', async () => {
    const hacerFetch = fetchCon(sobreCdr(Buffer.from(zipSync({ 'R-a.xml': strToU8('<r/>') })).toString('base64')));
    await enviar(hacerFetch);

    const [url, init] = hacerFetch.mock.calls[0]!;
    const sobre = init!.body as string;
    expect(url).toBe(endpoint);
    expect(init!.method).toBe('POST');
    expect(init!.headers).toEqual({ 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"urn:sendBill"' });
    expect(sobre).toContain('<ns2:Username>20000000001MODDATOS</ns2:Username>');
    expect(sobre).toContain('#PasswordText">cl&lt;av&amp;e</ns2:Password>');
    expect(sobre).toContain('<ns1:sendBill><fileName>a.zip</fileName><contentFile>AQID</contentFile></ns1:sendBill>');
  });

  it('agrega .zip al nombre si falta', async () => {
    const hacerFetch = fetchCon(sobreFault('soap-env:Client.0100', 'x'));
    await enviarZip({ endpoint, credenciales, nombreZip: 'b', zip, fetch: hacerFetch });
    expect(hacerFetch.mock.calls[0]![1]!.body).toContain('<fileName>b.zip</fileName>');
  });

  it('respeta la vista de un Uint8Array parcial', async () => {
    const hacerFetch = fetchCon(sobreFault('0100', 'x'));
    const vista = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);
    await enviarZip({ endpoint, credenciales, nombreZip: 'a.zip', zip: vista, fetch: hacerFetch });
    expect(hacerFetch.mock.calls[0]![1]!.body).toContain('<contentFile>AQID</contentFile>');
  });

  it('no sigue redirecciones', async () => {
    const hacerFetch = fetchCon('', 200);
    await enviar(hacerFetch);
    expect(hacerFetch.mock.calls[0]![1]!.redirect).toBe('manual');
  });
});

describe('enviarZip: respuestas', () => {
  it('decodifica applicationResponse', async () => {
    const cdr = zipSync({ 'R-a.xml': strToU8('<r/>') });
    const base64 = Buffer.from(cdr)
      .toString('base64')
      .replace(/(.{20})/g, '$1\n');
    const respuesta = await enviar(fetchCon(sobreCdr(base64)));
    expect(respuesta.fault).toBeNull();
    expect(respuesta.cdrZip).toEqual(cdr);
  });

  it.each([
    ['soap-env:Client.0100', '0100'],
    ['soap-env:Client.1033', '1033'],
    ['ns0:Client.0102', '0102'],
    ['0100', '0100'],
    ['2335', '2335'],
    ['100', '0100'],
  ])('lee el faultcode %s', async (faultcode, codigo) => {
    const respuesta = await enviar(fetchCon(sobreFault(faultcode, 'detalle'), 500));
    expect(respuesta).toEqual({ cdrZip: null, fault: { codigo, mensaje: 'detalle' } });
  });

  it('toma el código del faultstring si el faultcode no trae número', async () => {
    const respuesta = await enviar(fetchCon(sobreFault('soap-env:Server', '0109 - servicio no disponible')));
    expect(respuesta.fault?.codigo).toBe('0109');
  });

  it('conserva un faultcode sin número', async () => {
    const respuesta = await enviar(fetchCon(sobreFault('env:Server', 'Internal Error'), 500));
    expect(respuesta.fault).toEqual({ codigo: 'env:Server', mensaje: 'Internal Error' });
  });

  it('decodifica entidades del mensaje', async () => {
    const respuesta = await enviar(fetchCon(sobreFault('0100', 'a &amp; b')));
    expect(respuesta.fault?.mensaje).toBe('a & b');
  });

  it('convierte un error HTTP sin xml en fault', async () => {
    const respuesta = await enviar(fetchCon('<html><body>Bad Gateway</body></html>', 502));
    expect(respuesta).toEqual({ cdrZip: null, fault: { codigo: 'HTTP_502', mensaje: 'SUNAT respondió HTTP 502' } });
  });

  it('marca como inválido un 200 que no es SOAP', async () => {
    for (const cuerpo of ['<html><body>portal</body></html>', 'texto plano', '']) {
      const respuesta = await enviar(fetchCon(cuerpo));
      expect(respuesta.fault?.codigo).toBe('RESPUESTA_INVALIDA');
    }
  });

  it('detecta CDR ausente o corrupto', async () => {
    const vacio = '<Envelope><Body><sendBillResponse/></Body></Envelope>';
    expect((await enviar(fetchCon(vacio))).fault?.codigo).toBe('CDR_AUSENTE');
    expect((await enviar(fetchCon(sobreCdr('$$$')))).fault?.codigo).toBe('CDR_INVALIDO');
    expect((await enviar(fetchCon(sobreCdr('AQID')))).fault?.codigo).toBe('CDR_INVALIDO');
  });
});

describe('enviarZip: fallos de red', () => {
  it('lanza reintentable ante un fallo de red', async () => {
    const hacerFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    });
    const error = await fallo(enviar(hacerFetch));
    expect(error.reintentable).toBe(true);
    expect(error.codigo).toBe('TRANSPORTE_RED');
    expect(error.message).toContain('ECONNRESET');
  });

  it('corta por tiempo y limpia el temporizador', async () => {
    vi.useFakeTimers();
    const hacerFetch = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init!.signal!.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError')));
        }),
    );
    const promesa = fallo(enviar(hacerFetch));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(hacerFetch.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await promesa;
    expect(error.reintentable).toBe(true);
    expect(error.codigo).toBe('TRANSPORTE_TIEMPO');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('el tiempo límite también cubre la lectura del cuerpo', async () => {
    vi.useFakeTimers();
    const hacerFetch = vi.fn<typeof fetch>(async (_url, init) => {
      const cuerpo = new Promise<string>((_resolver, rechazar) => {
        init!.signal!.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError')));
      });
      return { status: 200, text: () => cuerpo } as Response;
    });
    const promesa = fallo(enviar(hacerFetch, 1_000));
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await promesa).codigo).toBe('TRANSPORTE_TIEMPO');
  });

  it('un endpoint inválido no es reintentable y no llama a fetch', async () => {
    const hacerFetch = fetchCon('');
    const error = await fallo(
      enviarZip({ endpoint: 'no es url', credenciales, nombreZip: 'a.zip', zip, fetch: hacerFetch }),
    );
    expect(error.reintentable).toBe(false);
    expect(hacerFetch).not.toHaveBeenCalled();
  });
});

describe('enviarZip: credenciales', () => {
  it('no filtra credenciales en un fault que las repite', async () => {
    const cuerpo = sobreFault('env:Client', 'usuario 20000000001MODDATOS clave cl&lt;av&amp;e rechazado');
    const respuesta = await enviar(fetchCon(cuerpo, 500));
    expect(respuesta.fault?.mensaje).toBe('usuario *** clave *** rechazado');
  });

  it('no filtra credenciales en errores de red', async () => {
    const hacerFetch = vi.fn<typeof fetch>(async () => {
      throw new Error(`fallo con 20000000001MODDATOS y ${credenciales.clave}`, {
        cause: { code: credenciales.clave },
      });
    });
    const error = await fallo(enviar(hacerFetch));
    const visible = `${error.message} ${error.stack} ${String(error.cause)} ${JSON.stringify(error)}`;
    expect(visible).not.toContain('MODDATOS');
    expect(visible).not.toContain(credenciales.clave);
  });
});
