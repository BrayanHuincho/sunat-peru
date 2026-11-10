import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

const raiz = process.cwd();
const carpetasOmitidas = new Set(['node_modules', 'dist', 'coverage', '.git']);
const extensionesProhibidas = new Set(['.pfx', '.p12', '.pem', '.key']);
const esteScript = join('.github', 'scripts', 'verificar-secretos.mjs');
const tamanoMaximo = 2_000_000;

const patrones = [
  { nombre: 'clave privada', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40,}/ },
  { nombre: 'credencial en variable', regex: /^[ \t]*SUNAT_[A-Z_]*(?:CLAVE|PASSWORD)[ \t]*=[ \t]*[^\s#]+/m },
  { nombre: 'clave demo de beta', regex: /clave\w*['"]?\s*[:=]\s*['"]moddatos['"]/i },
];

function archivosDelRepositorio() {
  try {
    const salida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: raiz,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return salida.toString('utf8').split('\0').filter(Boolean);
  } catch {
    return recorrer(raiz).map((ruta) => relative(raiz, ruta));
  }
}

function recorrer(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    if (entrada.isDirectory()) {
      return carpetasOmitidas.has(entrada.name) ? [] : recorrer(join(carpeta, entrada.name));
    }
    return entrada.isFile() ? [join(carpeta, entrada.name)] : [];
  });
}

function problemasDe(ruta) {
  const nombre = basename(ruta);
  if (extensionesProhibidas.has(extname(nombre).toLowerCase())) return ['archivo de certificado o clave'];
  if (nombre.startsWith('.env') && nombre !== '.env.example') return ['archivo de entorno'];

  const absoluta = join(raiz, ruta);
  if (ruta.split('/').join(sep) === esteScript || statSync(absoluta).size > tamanoMaximo) return [];

  const contenido = readFileSync(absoluta, 'utf8');
  return patrones
    .filter(({ nombre: motivo }) => !(ruta === 'README.md' && motivo === 'clave demo de beta'))
    .filter(({ regex }) => regex.test(contenido))
    .map(({ nombre: motivo }) => motivo);
}

const hallazgos = archivosDelRepositorio().flatMap((ruta) => problemasDe(ruta).map((motivo) => `${ruta}: ${motivo}`));

if (hallazgos.length > 0) {
  console.error(`Posibles secretos en el repositorio:\n${hallazgos.map((h) => `  ${h}`).join('\n')}`);
  process.exit(1);
}

console.log('Sin secretos detectados');
