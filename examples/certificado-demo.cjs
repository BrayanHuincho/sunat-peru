const forge = require('node-forge');

// autofirmado y desechable, sirve para firmar en local pero no para enviar a producción
function certificadoDemo(ruc) {
  const { publicKey, privateKey } = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  const atributos = [{ name: 'commonName', value: `Demo ${ruc}` }];

  certificado.publicKey = publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date(Date.now() - 86_400_000);
  certificado.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(privateKey, forge.md.sha256.create());

  return forge.pki.privateKeyToPem(privateKey) + forge.pki.certificateToPem(certificado);
}

const hoyEnLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const emisorDemo = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA DE PRUEBA SAC',
  domicilio: {
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    direccion: 'AV. SIEMPRE VIVA 123',
  },
};

module.exports = { certificadoDemo, hoyEnLima, emisorDemo };
