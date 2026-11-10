import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Sunat } from '../../src/index.js';
import type { ComprobanteEntrada, ResultadoEnvio } from '../../src/tipos.js';
import { emisorDemo, fechaLima, generarCertificadoPem } from './apoyo.js';

const usuarioSol = process.env.SUNAT_DEMO_USUARIO;
const claveSol = process.env.SUNAT_DEMO_CLAVE;
const activo = process.env.SUNAT_BETA === '1' && Boolean(usuarioSol) && Boolean(claveSol);

// beta rechaza correlativos repetidos, por eso salen del reloj
const correlativoBase = Math.floor(Date.now() / 1000) % 90_000_000;

function detalle(resultado: ResultadoEnvio): string {
  const { estado, codigo, descripcion, notas, numero, reintentable } = resultado;
  return JSON.stringify({ estado, codigo, descripcion, notas, numero, reintentable });
}

describe.skipIf(!activo)('envio real a SUNAT beta', () => {
  let sunat: Sunat;

  beforeAll(() => {
    sunat = new Sunat({
      entorno: 'beta',
      emisor: emisorDemo,
      usuarioSol: usuarioSol as string,
      claveSol: claveSol as string,
      certificado: generarCertificadoPem(emisorDemo.ruc),
      tiempoLimiteMs: 40_000,
    });
  });

  // beta responde 401 si llegan envios seguidos, con dos segundos de separacion no pasa
  afterEach(() => new Promise((listo) => setTimeout(listo, 2_500)));

  async function enviarYVerificar(entrada: ComprobanteEntrada): Promise<void> {
    const resultado = await sunat.enviar(entrada);
    console.info(`[beta] ${entrada.tipo} ${detalle(resultado)}`);
    expect(resultado.codigo, detalle(resultado)).toBe('0');
    expect(resultado.estado).toBe('aceptado');
    expect(resultado.cdrZip).not.toBeNull();
    expect(resultado.hash).not.toBe('');
  }

  it('acepta una factura', async () => {
    await enviarYVerificar({
      tipo: '01',
      serie: 'F001',
      correlativo: correlativoBase,
      fechaEmision: fechaLima(),
      moneda: 'PEN',
      preciosIncluyenIgv: false,
      formaPago: { tipo: 'contado' },
      cliente: { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE DE PRUEBA S.A.' },
      items: [
        { codigo: 'P001', descripcion: 'PRODUCTO DE PRUEBA', cantidad: 2, precioUnitario: '100.00', afectacion: '10' },
      ],
    });
  }, 60_000);

  it('acepta una boleta', async () => {
    await enviarYVerificar({
      tipo: '03',
      serie: 'B001',
      correlativo: correlativoBase + 1,
      fechaEmision: fechaLima(),
      moneda: 'PEN',
      preciosIncluyenIgv: true,
      cliente: { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'JUAN PEREZ' },
      items: [
        { codigo: 'P002', descripcion: 'PRODUCTO DE PRUEBA', cantidad: 1, precioUnitario: '59.00', afectacion: '10' },
      ],
    });
  }, 60_000);
});
