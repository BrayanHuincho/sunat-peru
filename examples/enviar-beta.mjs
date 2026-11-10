import { readFileSync } from 'node:fs';
import { Sunat } from 'sunat-peru';
import demo from './certificado-demo.cjs';

const { hoyEnLima, emisorDemo } = demo;
const { SUNAT_RUC, SUNAT_DEMO_USUARIO, SUNAT_DEMO_CLAVE, SUNAT_CERTIFICADO_RUTA, SUNAT_CERTIFICADO_CLAVE } =
  process.env;

if (!SUNAT_RUC || !SUNAT_DEMO_USUARIO || !SUNAT_DEMO_CLAVE || !SUNAT_CERTIFICADO_RUTA) {
  console.error(
    'Faltan variables. Copia .env.example a .env, complétalo y usa: node --env-file=.env examples/enviar-beta.mjs',
  );
  process.exit(1);
}

const sunat = new Sunat({
  entorno: 'beta',
  emisor: { ...emisorDemo, ruc: SUNAT_RUC },
  usuarioSol: SUNAT_DEMO_USUARIO,
  claveSol: SUNAT_DEMO_CLAVE,
  certificado: readFileSync(SUNAT_CERTIFICADO_RUTA),
  claveCertificado: SUNAT_CERTIFICADO_CLAVE,
});

const resultado = await sunat.enviar({
  tipo: '01',
  serie: 'F001',
  correlativo: Math.floor(Date.now() / 1000) % 99_999_999,
  fechaEmision: hoyEnLima(),
  preciosIncluyenIgv: true,
  cliente: { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE DE PRUEBA SAC' },
  items: [{ descripcion: 'Producto de prueba', cantidad: 1, precioUnitario: '118.00' }],
});

const { estado, reintentable, codigo, descripcion, notas, numero } = resultado;
console.log({ estado, reintentable, codigo, descripcion, notas, numero });
