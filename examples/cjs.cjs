const { Sunat } = require('sunat-peru');
const { certificadoDemo, hoyEnLima, emisorDemo } = require('./certificado-demo.cjs');

const sunat = new Sunat({
  entorno: 'beta',
  emisor: emisorDemo,
  usuarioSol: 'NOSEUSA',
  claveSol: 'NOSEUSA',
  certificado: certificadoDemo(emisorDemo.ruc),
});

const { nombreArchivo, comprobante } = sunat.preparar({
  tipo: '03',
  serie: 'B001',
  correlativo: 1,
  fechaEmision: hoyEnLima(),
  cliente: { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'CLIENTE DE PRUEBA' },
  items: [{ descripcion: 'Servicio de prueba', cantidad: 1, precioUnitario: 50 }],
});

console.log(nombreArchivo, comprobante.totales.total);
