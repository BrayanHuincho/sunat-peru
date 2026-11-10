import { Sunat } from 'sunat-peru';
import demo from './certificado-demo.cjs';

const { certificadoDemo, hoyEnLima, emisorDemo } = demo;

const sunat = new Sunat({
  entorno: 'beta',
  emisor: emisorDemo,
  usuarioSol: 'NOSEUSA',
  claveSol: 'NOSEUSA',
  certificado: certificadoDemo(emisorDemo.ruc),
});

const { comprobante, xml, hash, qr, nombreArchivo } = sunat.preparar({
  tipo: '01',
  serie: 'F001',
  correlativo: 1,
  fechaEmision: hoyEnLima(),
  preciosIncluyenIgv: true,
  cliente: { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE DE PRUEBA SAC' },
  items: [
    { descripcion: 'Teclado mecánico', cantidad: 2, precioUnitario: '118.00' },
    { descripcion: 'Bolsa plástica', cantidad: 1, precioUnitario: '0.20', aplicaIcbper: true },
  ],
});

console.log('Archivo:', nombreArchivo);
console.log('Totales:', comprobante.totales);
console.log('Leyendas:', comprobante.leyendas);
console.log('Hash:', hash);
console.log('QR:', qr);
console.log('Bytes de XML firmado:', xml.length);
