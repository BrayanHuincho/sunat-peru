import forge from 'node-forge';
import type { Emisor } from '../../src/tipos.js';

export const emisorDemo: Emisor = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA DE PRUEBA S.A.C.',
  nombreComercial: 'EMPRESA DE PRUEBA',
  domicilio: {
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    urbanizacion: '-',
    direccion: 'AV. PRUEBA 123',
    codigoLocal: '0000',
  },
};

export function generarCertificadoPem(ruc: string): string {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  const ahora = Date.now();
  const atributos = [
    { name: 'commonName', value: `PRUEBA ${ruc}` },
    { name: 'countryName', value: 'PE' },
    { name: 'organizationName', value: 'EMPRESA DE PRUEBA' },
  ];
  certificado.publicKey = llaves.publicKey;
  certificado.serialNumber = ahora.toString(16);
  certificado.validity.notBefore = new Date(ahora - 86_400_000);
  certificado.validity.notAfter = new Date(ahora + 365 * 86_400_000);
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(llaves.privateKey, forge.md.sha256.create());
  return `${forge.pki.privateKeyToPem(llaves.privateKey)}\n${forge.pki.certificateToPem(certificado)}`;
}

export function fechaLima(diasDespues = 0): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const fecha = new Date(`${hoy}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + diasDespues);
  return fecha.toISOString().slice(0, 10);
}
