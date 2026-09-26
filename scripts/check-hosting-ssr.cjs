// Local preflight only: invoke Firebase CLI's generation phase with a demo project.
// This does not call deploy, create resources, or edit firebase.json.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const project = 'demo-atria-ssr-check';
process.chdir(root);
Object.assign(process.env, {
  NEXT_TELEMETRY_DISABLED: '1',
  FIREBASE_FRAMEWORKS_BUILD_TARGET: 'production',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-placeholder-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: project,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${project}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:ci-placeholder',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-CI-DUMMY',
  NEXT_PUBLIC_LOCAL_PREVIEW: 'false',
  NEXT_PUBLIC_USE_AUTH_EMULATOR: 'false',
  NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: 'false',
});

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22');
  const { Config } = require('firebase-tools/lib/config');
  const { prepareFrameworks } = require('firebase-tools/lib/frameworks');
  const integration = require('firebase-tools/lib/frameworks/next');
  const semver = require('semver');
  const source = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  assert.equal(source.dependencies['firebase-admin'], '13.10.0');
  assert(semver.satisfies(require('next/package.json').version, integration.supportedRange));
  assert(!Array.isArray(firebase.hosting), 'Review multi-site configuration before running this check');
  const hosting = { ...firebase.hosting, site: project };
  delete hosting.target;
  const config = new Config({ hosting }, { projectDir: root });
  const options = { project, projectRoot: root, cwd: root, config, site: project,
    only: 'hosting', nonInteractive: true };

  // Use the same complete generator as Hosting deployment, not a handwritten manifest.
  await prepareFrameworks('deploy', ['hosting'], { projectId: project }, options);
  const directory = path.join(root, '.firebase', project, 'functions');
  const generated = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(generated.engines.node, '22');
  assert.equal(generated.dependencies['firebase-admin'], '13.10.0');
  assert.equal(lock.packages['node_modules/next'].version, source.dependencies.next);
  assert.equal(lock.packages['node_modules/firebase-admin'].version, '13.10.0');
  assert.equal(semver.major(lock.packages['node_modules/firebase-functions'].version), 6);
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name.endsWith('/jws')) assert(semver.satisfies(entry.version, '^3.2.3 || ^4.0.1'));
    if (name.endsWith('/nanoid')) assert(semver.gte(entry.version, '3.3.19'));
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['ls', '--omit=dev', '--all'], {
    cwd: directory, encoding: 'utf8', shell: process.platform === 'win32',
  });
  fs.writeFileSync(path.join(directory, '..', 'dependency-tree.txt'), result.stdout || '');
  assert.equal(result.status, 0, result.stderr);
  console.log(JSON.stringify({ directory, node: generated.engines.node,
    next: lock.packages['node_modules/next'].version,
    admin: lock.packages['node_modules/firebase-admin'].version,
    frameworks: lock.packages['node_modules/firebase-frameworks'].version,
    functions: lock.packages['node_modules/firebase-functions'].version,
    dependencyResolution: 'passed', deployed: false }, null, 2));

  const audit = spawnSync(npm, ['audit', '--omit=dev', '--json'], {
    cwd: directory, encoding: 'utf8', shell: process.platform === 'win32',
  });
  assert([0, 1].includes(audit.status), audit.stderr);
  const report = JSON.parse(audit.stdout);
  assert(report.metadata && report.vulnerabilities, 'Audit did not return a valid report');
  fs.writeFileSync(path.join(directory, '..', 'audit.json'), JSON.stringify(report, null, 2));
  const baseline = JSON.parse(fs.readFileSync(path.join(root,
    'docs/security/dependency-audit-issue19.json'), 'utf8')).priorLocalGeneratedSsr;
  const advisories = (data) => Object.values(data.vulnerabilities)
    .flatMap((item) => item.via.filter((via) => typeof via === 'object'));
  const known = new Set(advisories(baseline).map((item) => item.url));
  const added = [...new Set(advisories(report).filter((item) => !known.has(item.url))
    .map((item) => `${item.name}: ${item.url}`))];
  console.log('Generated SSR audit:', report.metadata.vulnerabilities);
  assert.equal(report.metadata.vulnerabilities.critical, 0, 'Critical vulnerabilities remain');
  assert.equal(added.length, 0,
    `New generated SSR advisories; do not deploy without review:\n${added.join('\n')}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
