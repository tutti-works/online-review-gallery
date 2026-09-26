const { spawn } = require('node:child_process');
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_LOCAL_PREVIEW: 'true',
      NEXT_PUBLIC_USE_AUTH_EMULATOR: 'false',
      NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: 'false',
    },
  }
);
child.on('exit', (code) => process.exit(code ?? 1));
