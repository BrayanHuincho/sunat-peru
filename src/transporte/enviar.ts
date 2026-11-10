import { ErrorTransporte } from '../errores.js';
import type { CredencialesSol, RespuestaSoap } from '../tipos.js';
import { interpretarRespuesta } from './respuesta.js';
import { construirSobre, usuarioSoap } from './sobre.js';

const TIEMPO_LIMITE_MS = 60_000;

export interface ArgumentosEnvio {
  endpoint: string;
  credenciales: CredencialesSol;
  nombreZip: string;
  zip: Uint8Array;
  tiempoLimiteMs?: number;
  fetch?: typeof fetch;
}

export async function enviarZip(args: ArgumentosEnvio): Promise<RespuestaSoap> {
  const { endpoint, credenciales, zip, tiempoLimiteMs = TIEMPO_LIMITE_MS } = args;
  if (!URL.canParse(endpoint)) {
    throw new ErrorTransporte('el endpoint de SUNAT no es una URL válida', false, 'TRANSPORTE_ENDPOINT');
  }

  const hacerFetch = args.fetch ?? globalThis.fetch;
  const nombreZip = args.nombreZip.toLowerCase().endsWith('.zip') ? args.nombreZip : `${args.nombreZip}.zip`;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), tiempoLimiteMs);

  try {
    const respuesta = await hacerFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"urn:sendBill"' },
      body: construirSobre(credenciales, nombreZip, zip),
      signal: controlador.signal,
      // la clave viaja en el cuerpo: seguir un 307 la reenviaría a otro host
      redirect: 'manual',
    });
    const cuerpo = await respuesta.text();
    return ocultarCredenciales(interpretarRespuesta(respuesta.status, cuerpo), credenciales);
  } catch (error) {
    if (controlador.signal.aborted) {
      throw new ErrorTransporte(`SUNAT no respondió en ${tiempoLimiteMs} ms`, true, 'TRANSPORTE_TIEMPO');
    }
    throw new ErrorTransporte(mensajeDeRed(error), true, 'TRANSPORTE_RED');
  } finally {
    clearTimeout(temporizador);
  }
}

function mensajeDeRed(error: unknown): string {
  const causa = error instanceof Error ? error.cause : undefined;
  const codigo = typeof causa === 'object' && causa !== null && 'code' in causa ? causa.code : undefined;
  const detalle = typeof codigo === 'string' && /^[A-Z0-9_]+$/.test(codigo) ? ` (${codigo})` : '';
  return `no se pudo conectar con SUNAT${detalle}`;
}

function ocultarCredenciales(respuesta: RespuestaSoap, credenciales: CredencialesSol): RespuestaSoap {
  if (!respuesta.fault) return respuesta;
  const secretos = [usuarioSoap(credenciales), credenciales.clave, credenciales.usuario].filter(Boolean);
  const ocultar = (texto: string) => secretos.reduce((t, secreto) => t.split(secreto).join('***'), texto);
  return {
    cdrZip: null,
    fault: { codigo: ocultar(respuesta.fault.codigo), mensaje: ocultar(respuesta.fault.mensaje) },
  };
}
