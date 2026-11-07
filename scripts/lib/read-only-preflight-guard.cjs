// No application inspection or writes. All final guard requirements stay strict.
const identitySQL = `SELECT current_user, session_user, current_database() AS database,
  current_setting('transaction_read_only') AS read_only,
  current_setting('default_transaction_read_only') AS default_read_only,
  current_setting('server_version') AS version`;

function identityChecks(identity, stream) {
  return {
    currentRoleMatches: identity?.current_user === 'postgres',
    sessionRoleMatches: identity?.session_user === 'postgres',
    databaseMatches: identity?.database === 'postgres',
    transactionReadOnly: identity?.read_only === 'on',
    sessionDefaultReadOnly: identity?.default_read_only === 'on',
    encryptedClientSocket: stream?.encrypted === true,
    certificateAuthorized: stream?.authorized === true,
  };
}

async function guardReadOnlyConnection(client) {
  const diagnostics = { stage: 'tls' };
  const fail = code => {
    const error = new Error(code);
    error.code = code;
    error.guardDiagnostics = diagnostics;
    throw error;
  };
  const stream = client.connection?.stream;
  if (stream?.encrypted !== true || stream?.authorized !== true) fail('GUARD_TLS_IDENTITY');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  diagnostics.stage = 'initial-identity';
  const initial = (await client.query(identitySQL)).rows[0];
  diagnostics.initialChecks = identityChecks(initial, stream);
  // The active transaction must ALREADY be read-only. Never repair a wrong
  // identity, unauthorized TLS, or an unexpectedly writable transaction.
  const core = ['currentRoleMatches', 'sessionRoleMatches', 'databaseMatches', 'transactionReadOnly', 'encryptedClientSocket', 'certificateAuthorized'];
  if (core.some(key => diagnostics.initialChecks[key] !== true)
    || !['on', 'off'].includes(initial?.default_read_only)) fail('GUARD_REMOTE_IDENTITY_OR_TRANSACTION');

  // Poolers need not forward startup options. Establish the same requirements
  // explicitly within this protected transaction; no persistent setting changes.
  diagnostics.stage = 'transaction-local-settings';
  await client.query(`SET LOCAL default_transaction_read_only = on;
    SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';
    SET LOCAL transaction_timeout = '10min'; SET LOCAL idle_in_transaction_session_timeout = '60s';
    SET LOCAL timezone = 'UTC'; SET LOCAL search_path = public,pg_catalog`);
  diagnostics.stage = 'final-identity';
  const final = (await client.query(identitySQL)).rows[0];
  diagnostics.finalChecks = identityChecks(final, client.connection?.stream);
  if (Object.values(diagnostics.finalChecks).some(value => value !== true)) fail('GUARD_FINAL_READONLY_REQUIREMENTS');
  diagnostics.stage = 'passed';
  diagnostics.startupDefaultReadOnlyObserved = initial.default_read_only;
  diagnostics.serverVersion = final.version;
  return diagnostics;
}

module.exports = { identitySQL, identityChecks, guardReadOnlyConnection };
