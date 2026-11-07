// Scoped to preflight/rehearsal tooling. No connections, global trust changes or credentials logged.
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { X509Certificate } = require('node:crypto');

const certificatePath = path.join(__dirname, '../../certs/supabase-prod-ca-2021.crt');
const expectedFingerprint = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';

function loadVerifiedRoot(file = certificatePath, now = Date.now()) {
  const pem = fs.readFileSync(file, 'utf8');
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (certificates.length !== 1 || /PRIVATE KEY/.test(pem)) throw Error('Unexpected CA certificate file');
  const certificate = new X509Certificate(certificates[0]);
  if (certificate.fingerprint256.replaceAll(':', '').toLowerCase() !== expectedFingerprint
    || !certificate.ca || !certificate.verify(certificate.publicKey)
    || now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw Error('CA integrity or validity check failed');
  tls.createSecureContext({ ca: pem, minVersion: 'TLSv1.2' });
  return { pem, fingerprint256: expectedFingerprint, validTo: certificate.validTo };
}

function verifiedPostgresConfig(value, env = process.env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('Unsafe process TLS override rejected');
  // A custom runtime trust loader could alter TLS defaults. Use a clean invocation.
  if (env.NODE_OPTIONS) throw Error('Review custom NODE_OPTIONS before preflight');
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid PostgreSQL connection configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !(url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)))
    throw Error('Expected Supabase PostgreSQL hostname');
  for (const [key, option] of url.searchParams) {
    if (key !== 'sslmode' || option !== 'verify-full') throw Error('Unexpected URL option; review before connection');
  }
  if (!url.username || !url.password || url.pathname !== '/postgres') throw Error('Unexpected PostgreSQL account/database configuration');
  const root = loadVerifiedRoot();
  // Discrete fields prevent connection-string SSL options from replacing this CA.
  // Node's default certificate-chain AND hostname checks remain in effect.
  return { host: url.hostname, port: url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543' ? 5432 : Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: 'postgres',
    ssl: { ca: root.pem, minVersion: 'TLSv1.2' } };
}

module.exports = { certificatePath, expectedFingerprint, loadVerifiedRoot, verifiedPostgresConfig };
