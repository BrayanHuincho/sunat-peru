import { leerCdr, clasificarCodigo } from '../cdr/index.js';
import { ErrorCertificado, ErrorTransporte, ErrorValidacion } from '../errores.js';
import { cargarCertificado, firmarXml } from '../firma/index.js';
import { calcularComprobante } from '../impuestos/index.js';
import { cadenaQr } from '../qr/index.js';
import type {
  Cdr,
  Certificado,
  Clasificacion,
  ComprobanteCalculado,
  ComprobanteEntrada,
  Entorno,
  OpcionesSunat,
  RespuestaSoap,
  ResultadoEnvio,
} from '../tipos.js';
import { comprimirXml, endpointPara, enviarZip } from '../transporte/index.js';
import { validarComprobante } from '../validacion/index.js';
import { construirXmlComprobante, nombreArchivo } from '../xml/index.js';

export interface ComprobantePreparado {
  comprobante: ComprobanteCalculado;
  xml: string;
  hash: string;
  qr: string;
  nombreArchivo: string;
}

type Desenlace = Pick<ResultadoEnvio, 'estado' | 'reintentable' | 'codigo' | 'descripcion' | 'notas' | 'cdrZip'>;

export class Sunat {
  readonly #opciones: OpcionesSunat;
  readonly #endpoint: string;
  readonly #certificado: Certificado;

  constructor(opciones: OpcionesSunat) {
    this.#opciones = opciones;
    this.#endpoint = resolverEndpoint(opciones.entorno, opciones.endpoint);
    this.#certificado = cargarCertificado(opciones.certificado, opciones.claveCertificado);
  }

  preparar(entrada: ComprobanteEntrada): ComprobantePreparado {
    if (this.#certificado.venceEn.getTime() < Date.now()) {
      throw new ErrorCertificado(`El certificado venció el ${this.#certificado.venceEn.toISOString().slice(0, 10)}`);
    }
    const { emisor } = this.#opciones;
    validarComprobante(entrada, emisor, fechaEnPeru(new Date()));
    const comprobante = calcularComprobante(entrada);
    const { xml, hash } = firmarXml(construirXmlComprobante(comprobante, emisor), this.#certificado);
    return {
      comprobante,
      xml,
      hash,
      qr: cadenaQr(emisor, comprobante, hash),
      nombreArchivo: nombreArchivo(emisor.ruc, comprobante),
    };
  }

  async enviar(entrada: ComprobanteEntrada): Promise<ResultadoEnvio> {
    const { comprobante, xml, hash, qr, nombreArchivo: nombre } = this.preparar(entrada);
    const desenlace = await this.#transmitir(nombre, xml);
    return { ...desenlace, numero: comprobante.numero, nombreArchivo: nombre, hash, qr, xml };
  }

  async #transmitir(nombre: string, xml: string): Promise<Desenlace> {
    const { emisor, usuarioSol, claveSol, tiempoLimiteMs, fetch } = this.#opciones;
    try {
      const respuesta = await enviarZip({
        endpoint: this.#endpoint,
        credenciales: { ruc: emisor.ruc, usuario: usuarioSol, clave: claveSol },
        nombreZip: `${nombre}.zip`,
        zip: comprimirXml(`${nombre}.xml`, xml),
        tiempoLimiteMs,
        fetch,
      });
      return interpretarRespuesta(respuesta, this.#opciones.entorno);
    } catch (error) {
      return desenlaceDeFallo(error);
    }
  }
}

function resolverEndpoint(entorno: Entorno, propio: string | undefined): string {
  if (entorno !== 'beta' && entorno !== 'produccion') {
    throw problemaDeConfiguracion('entorno', `debe ser beta o produccion, se recibió ${String(entorno)}`);
  }
  if (propio === undefined) return endpointPara(entorno);

  const contrario = entorno === 'beta' ? 'produccion' : 'beta';
  if (hostDe(propio) === hostDe(endpointPara(contrario))) {
    throw problemaDeConfiguracion('endpoint', `apunta a ${contrario} pero el entorno es ${entorno}`);
  }
  return propio;
}

function hostDe(url: string): string {
  if (!URL.canParse(url)) throw problemaDeConfiguracion('endpoint', 'no es una URL válida');
  return new URL(url).hostname;
}

function problemaDeConfiguracion(campo: string, mensaje: string): ErrorValidacion {
  return new ErrorValidacion([{ campo, mensaje }]);
}

// la fecha tributaria es la de lima, un servidor en utc ya está en mañana desde las 7 pm
function fechaEnPeru(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function interpretarRespuesta(respuesta: RespuestaSoap, entorno: Entorno): Desenlace {
  if (respuesta.cdrZip) return desenlaceDeCdr(respuesta.cdrZip);
  if (respuesta.fault) return desenlaceDeFault(respuesta.fault.codigo, respuesta.fault.mensaje, entorno);
  return fallo('SUNAT no devolvió CDR ni error', true, null);
}

function desenlaceDeCdr(cdrZip: Uint8Array): Desenlace {
  let cdr: Cdr;
  try {
    cdr = leerCdr(cdrZip);
  } catch (error) {
    return {
      ...fallo(
        `SUNAT pudo haber registrado el comprobante pero su CDR es ilegible: ${mensajeDe(error)}`,
        false,
        'CDR_INVALIDO',
      ),
      cdrZip,
    };
  }
  const clasificacion = clasificarCodigo(cdr.codigo);
  if (esDeNegocio(clasificacion)) {
    return {
      estado: cdr.estado,
      reintentable: false,
      codigo: cdr.codigo,
      descripcion: cdr.descripcion,
      notas: cdr.notas,
      cdrZip,
    };
  }
  return { ...desenlaceDeError(clasificacion, cdr.codigo, cdr.descripcion), notas: cdr.notas, cdrZip };
}

function desenlaceDeFault(codigo: string, mensaje: string, entorno: Entorno): Desenlace {
  if (!/^\d+$/.test(codigo)) return desenlaceDeProtocolo(codigo, mensaje, entorno);
  const clasificacion = clasificarCodigo(codigo);
  if (clasificacion.tipo === 'rechazado') {
    return { estado: 'rechazado', reintentable: false, codigo, descripcion: mensaje, notas: [], cdrZip: null };
  }
  return desenlaceDeError(clasificacion, codigo, mensaje);
}

function desenlaceDeProtocolo(codigo: string, mensaje: string, entorno: Entorno): Desenlace {
  const http = /^HTTP_(\d+)$/.exec(codigo)?.[1];
  if (http !== undefined) {
    const estado = Number(http);
    // beta responde 401 a envíos muy seguidos aunque las credenciales estén bien
    const rafagaEnBeta = estado === 401 && entorno === 'beta';
    return fallo(mensaje, rafagaEnBeta || estado === 408 || estado === 429 || estado >= 500, codigo);
  }
  if (codigo === 'CDR_INVALIDO') return fallo(mensaje, false, codigo);
  if (codigo === 'RESPUESTA_INVALIDA' || codigo === 'CDR_AUSENTE') {
    return fallo(`${mensaje}. Si SUNAT ya lo registró, reintentar puede devolver 1033`, true, codigo);
  }
  return fallo(mensaje, true, codigo);
}

function esDeNegocio(clasificacion: Clasificacion): boolean {
  return clasificacion.tipo === 'aceptado' || clasificacion.tipo === 'observado' || clasificacion.tipo === 'rechazado';
}

function desenlaceDeError(clasificacion: Clasificacion, codigo: string, mensaje: string): Desenlace {
  switch (clasificacion.tipo) {
    case 'transitorio':
      return fallo(`SUNAT no pudo atender el envío (${codigo}): ${mensaje}`, true, codigo);
    case 'credenciales':
      return fallo(
        `SUNAT rechazó las credenciales SOL (${codigo}), revisa RUC, usuario y clave: ${mensaje}`,
        false,
        codigo,
      );
    case 'duplicado':
      return fallo(
        `El comprobante ya fue informado a SUNAT (${codigo}), no lo reenvíes y consulta su CDR: ${mensaje}`,
        false,
        codigo,
      );
    default:
      return fallo(`SUNAT devolvió un código no procesable (${codigo}): ${mensaje}`, false, codigo);
  }
}

function desenlaceDeFallo(error: unknown): Desenlace {
  if (error instanceof ErrorTransporte) return fallo(error.message, error.reintentable, error.codigo);
  return fallo(`Falló el envío a SUNAT: ${mensajeDe(error)}`, true, null);
}

function fallo(descripcion: string, reintentable: boolean, codigo: string | null): Desenlace {
  return { estado: 'error', reintentable, codigo, descripcion, notas: [], cdrZip: null };
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
