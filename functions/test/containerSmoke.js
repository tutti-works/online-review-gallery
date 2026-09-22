const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const pdf2pic = require('pdf2pic');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${command} failed: ${result.stderr || result.stdout}`
  );
  return result.stdout.trim();
}

async function main() {
  const gmVersion = run('gm', ['version']);
  const gsVersion = run('gs', ['--version']);
  assert.match(gmVersion, /GraphicsMagick/i);
  assert.match(gsVersion, /^\d+\.\d+/);

  const sourceImage = await sharp({
    create: {
      width: 128,
      height: 96,
      channels: 3,
      background: '#336699',
    },
  }).png().toBuffer();
  const webp = await sharp(sourceImage).resize(64, 48).webp({ quality: 80 }).toBuffer();
  const webpMetadata = await sharp(webp).metadata();
  assert.equal(webpMetadata.format, 'webp');
  assert.equal(webpMetadata.width, 64);
  assert.equal(webpMetadata.height, 48);

  const pdfPath = '/tmp/online-review-gallery-smoke.pdf';
  run('gs', [
    '-q',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    `-sOutputFile=${pdfPath}`,
    '-c',
    '/Helvetica findfont 24 scalefont setfont 72 720 moveto (PDF smoke test) show showpage',
  ]);

  const converter = pdf2pic.fromPath(pdfPath, {
    density: 72,
    saveFilename: 'online-review-gallery-smoke',
    savePath: '/tmp',
    format: 'jpeg',
    width: 320,
    height: 240,
  });
  const page = await converter(1);
  assert.ok(page.path, 'pdf2pic did not return an output path');
  const pageMetadata = await sharp(page.path).metadata();
  assert.equal(pageMetadata.format, 'jpeg');
  assert.ok(pageMetadata.width > 0);
  assert.ok(pageMetadata.height > 0);

  fs.rmSync(pdfPath, { force: true });
  fs.rmSync(page.path, { force: true });
  require('@google-cloud/functions-framework');
  const { processFileTask } = require('../lib/cloudrun');
  assert.equal(typeof processFileTask, 'function');
  console.log('Container smoke test passed: GraphicsMagick, Ghostscript, Sharp, PDF, WebP and Cloud Run entry point');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
