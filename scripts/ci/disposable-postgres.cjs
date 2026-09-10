const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

exports.createDisposablePostgres = ({ env }) => {
  const candidates = process.platform === 'win32' ? [
    path.join(env.LOCALAPPDATA || '', 'Programs/DockerDesktop/resources/bin/docker.exe'),
    'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
  ] : [];
  const docker = candidates.find(file => fs.existsSync(file)) || 'docker';
  const call = (args, options = {}) => execFileSync(docker, args, { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, ...options });
  const endpoint = JSON.parse(call(['context', 'inspect']))[0]?.Endpoints?.docker?.Host;
  assert.ok(typeof endpoint === 'string' && /^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(endpoint), 'Only a local Unix socket or Windows named pipe Docker endpoint is allowed');
  const host = ['--host', endpoint];
  const info = JSON.parse(call([...host, 'info', '--format', '{{json .}}']));
  assert.equal(info.OSType, 'linux', 'PostgreSQL tests require Linux containers');
  let image;
  try { image = JSON.parse(call([...host, 'image', 'inspect', 'postgres:17.10']))[0]; }
  catch { throw new Error('Official image postgres:17.10 is required locally. Download it explicitly with docker pull postgres:17.10; no automatic pull is performed.'); }
  const token = crypto.randomUUID();
  const container = `staynex-ci-knowledge-${token}`;
  let id;
  const inspect = () => JSON.parse(call([...host, 'inspect', id]))[0];
  const verify = value => {
    assert.equal(value.Id, id);
    assert.equal(value.Config.Labels['staynex.ci.disposable'], token);
    assert.equal(value.HostConfig.NetworkMode, 'none');
    assert.equal(Object.keys(value.HostConfig.PortBindings || {}).length, 0);
    assert.equal(value.HostConfig.Tmpfs['/var/lib/postgresql/data'], 'rw');
    assert.ok(!(value.Mounts || []).some(mount => mount.Type === 'volume' || mount.Type === 'bind'));
  };
  const cleanup = () => { if (id) { verify(inspect()); call([...host, 'rm', '--force', '--volumes', id]); } };
  try {
    id = call([...host, 'create', '--name', container, '--label', `staynex.ci.disposable=${token}`,
      '--network', 'none', '--tmpfs', '/var/lib/postgresql/data:rw',
      '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image.Id]).trim();
    verify(inspect());
    call([...host, 'start', id]);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { call([...host, 'exec', id, 'pg_isready', '-U', 'postgres']); ready = true; break; } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000); }
    }
    assert.ok(ready, 'Disposable PostgreSQL did not become ready');
    return { docker, host, container, inspect: inspect(), cleanup };
  } catch (error) { cleanup(); throw error; }
};
