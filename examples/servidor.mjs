import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { ErrorSunat, ErrorValidacion, Sunat } from 'sunat-peru';
import demo from './certificado-demo.cjs';

const { emisorDemo } = demo;
const {
  SUNAT_RUC,
  SUNAT_DEMO_USUARIO,
  SUNAT_DEMO_CLAVE,
  SUNAT_CERTIFICADO_RUTA,
  SUNAT_CERTIFICADO_CLAVE,
  PUERTO = '3000',
} = process.env;

if (!SUNAT_RUC || !SUNAT_DEMO_USUARIO || !SUNAT_DEMO_CLAVE || !SUNAT_CERTIFICADO_RUTA) {
  console.error('Faltan variables. Revisa .env.example y usa: node --env-file=.env examples/servidor.mjs');
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

async function leerJson(peticion) {
  let texto = '';
  for await (const parte of peticion) texto += parte;
  return JSON.parse(texto);
}

function responder(respuesta, estado, cuerpo) {
  respuesta.writeHead(estado, { 'Content-Type': 'application/json' });
  respuesta.end(JSON.stringify(cuerpo));
}

async function atender(peticion, respuesta) {
  if (peticion.method !== 'POST' || !['/preparar', '/enviar'].includes(peticion.url)) {
    return responder(respuesta, 404, { error: 'Usa POST /preparar o POST /enviar' });
  }
  const entrada = await leerJson(peticion);
  if (peticion.url === '/preparar') {
    const { comprobante, hash, qr, nombreArchivo, xml } = sunat.preparar(entrada);
    return responder(respuesta, 200, { comprobante, hash, qr, nombreArchivo, xml });
  }
  const { cdrZip, ...resultado } = await sunat.enviar(entrada);
  return responder(respuesta, 200, { ...resultado, cdrZip: cdrZip ? Buffer.from(cdrZip).toString('base64') : null });
}

createServer((peticion, respuesta) => {
  atender(peticion, respuesta).catch((error) => {
    if (error instanceof ErrorValidacion)
      return responder(respuesta, 422, { error: error.message, problemas: error.problemas });
    if (error instanceof ErrorSunat) return responder(respuesta, 400, { error: error.message, codigo: error.codigo });
    if (error instanceof SyntaxError) return responder(respuesta, 400, { error: 'El cuerpo no es JSON válido' });
    console.error(error);
    responder(respuesta, 500, { error: 'Error interno' });
  });
}).listen(Number(PUERTO), () => console.log(`Escuchando en http://127.0.0.1:${PUERTO}`));
