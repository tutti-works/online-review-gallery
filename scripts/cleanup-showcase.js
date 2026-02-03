#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const readJsonIfExists = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const parseEnvFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const entries = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) {
      entries[key] = value;
    }
  });
  return entries;
};

const args = process.argv.slice(2);
const getFlagValue = (flag) => {
  const prefix = `${flag}=`;
  const entry = args.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
};
const hasFlag = (flag) => args.includes(flag);

const projectFromArg = getFlagValue('--project');
const credentialsFromArg = getFlagValue('--credentials');
const bucketFromArg = getFlagValue('--bucket');
const listLimit = Number.parseInt(getFlagValue('--limit') || '50', 10);

const dryRun = !hasFlag('--apply');
const deleteOrphanDocs = hasFlag('--delete-orphan-docs');
const deleteEmptyCuratedDocs = hasFlag('--delete-empty-curated');
const deleteOrphanFiles = hasFlag('--delete-orphan-files');
const includeNonOverview = hasFlag('--include-non-overview');
const listAll = hasFlag('--list-all');

const repoRoot = process.cwd();
const firebaserc = readJsonIfExists(path.join(repoRoot, '.firebaserc'));
const projectFromRc = firebaserc?.projects?.default || null;
const envEntries = {
  ...parseEnvFile(path.join(repoRoot, '.env.local')),
  ...parseEnvFile(path.join(repoRoot, '.env.production')),
  ...parseEnvFile(path.join(repoRoot, '.env')),
};
const credentialsPath =
  credentialsFromArg ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(repoRoot, 'firebase-admin-key.json');

if (!fs.existsSync(credentialsPath)) {
  console.error('[cleanup-showcase] Missing credentials file:', credentialsPath);
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or pass --credentials=PATH');
  process.exit(1);
}

const serviceAccount = readJsonIfExists(credentialsPath);
if (!serviceAccount) {
  console.error('[cleanup-showcase] Failed to read credentials:', credentialsPath);
  process.exit(1);
}

const projectId = projectFromArg || serviceAccount.project_id || projectFromRc;
if (!projectId) {
  console.error('[cleanup-showcase] Missing project id. Pass --project=PROJECT_ID');
  process.exit(1);
}

const bucketName =
  bucketFromArg ||
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  envEntries.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  `${projectId}.appspot.com`;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId,
  storageBucket: bucketName,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const printList = (label, items) => {
  const limited = listAll ? items : items.slice(0, listLimit);
  if (items.length === 0) {
    console.log(`${label}: 0`);
    return;
  }
  console.log(`${label}: ${items.length}`);
  limited.forEach((item) => console.log(`- ${item}`));
  if (!listAll && items.length > limited.length) {
    console.log(`… ${items.length - limited.length} more (use --list-all to show all)`);
  }
};

const isOverviewFile = (name) => name.includes('/overview-');

const run = async () => {
  console.log('[cleanup-showcase] Project:', projectId);
  console.log('[cleanup-showcase] Bucket:', bucketName);
  console.log('[cleanup-showcase] Dry run:', dryRun);

  const [galleriesSnap, showcaseSnap] = await Promise.all([
    db.collection('galleries').get(),
    db.collection('showcaseGalleries').get(),
  ]);

  const galleryIds = new Set(galleriesSnap.docs.map((doc) => doc.id));
  const showcaseDocs = showcaseSnap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data(),
    ref: doc.ref,
  }));

  const orphanShowcaseDocs = showcaseDocs
    .filter((doc) => !galleryIds.has(doc.id))
    .map((doc) => doc.id);

  const emptyCuratedDocs = showcaseDocs
    .filter((doc) => {
      const curated = doc.data.curatedArtworkIds;
      return !Array.isArray(curated) || curated.length === 0;
    })
    .map((doc) => doc.id);

  const missingUpdateSources = showcaseDocs
    .filter((doc) => doc.data.updateSourceGalleryId && !galleryIds.has(doc.data.updateSourceGalleryId))
    .map((doc) => `${doc.id} -> ${doc.data.updateSourceGalleryId}`);

  const deleteDocIds = new Set();
  if (deleteOrphanDocs) {
    orphanShowcaseDocs.forEach((docId) => deleteDocIds.add(docId));
  }
  if (deleteEmptyCuratedDocs) {
    emptyCuratedDocs.forEach((docId) => deleteDocIds.add(docId));
  }

  const docsForStorage = deleteDocIds.size > 0
    ? showcaseDocs.filter((doc) => !deleteDocIds.has(doc.id))
    : showcaseDocs;

  const keepStoragePaths = new Set();
  docsForStorage.forEach((doc) => {
    if (doc.data.overviewImagePath) {
      keepStoragePaths.add(doc.data.overviewImagePath);
    }
    if (doc.data.overviewImageThumbPath) {
      keepStoragePaths.add(doc.data.overviewImageThumbPath);
    }
  });

  const [files] = await bucket.getFiles({ prefix: 'showcase/' });
  const candidateFiles = files
    .map((file) => file.name)
    .filter((name) => (includeNonOverview ? true : isOverviewFile(name)));

  const unusedFiles = candidateFiles.filter((name) => !keepStoragePaths.has(name));

  printList('Orphan showcase docs', orphanShowcaseDocs);
  printList('Empty curated docs', emptyCuratedDocs);
  printList('Missing update source galleries', missingUpdateSources);
  printList('Unused showcase storage files', unusedFiles);

  if (dryRun) {
    console.log('[cleanup-showcase] Dry run only. No deletions executed.');
    return;
  }

  if (!deleteOrphanDocs && !deleteEmptyCuratedDocs && !deleteOrphanFiles) {
    console.log('[cleanup-showcase] No delete flags provided. Nothing deleted.');
    return;
  }

  const docsToDelete = Array.from(deleteDocIds);

  if (docsToDelete.length > 0) {
    const batch = db.batch();
    docsToDelete.forEach((docId) => {
      batch.delete(db.collection('showcaseGalleries').doc(docId));
    });
    await batch.commit();
    console.log(`[cleanup-showcase] Deleted showcase docs: ${docsToDelete.length}`);
  }

  if (deleteOrphanFiles && unusedFiles.length > 0) {
    const deleteBatches = [];
    const chunkSize = 50;
    for (let i = 0; i < unusedFiles.length; i += chunkSize) {
      deleteBatches.push(unusedFiles.slice(i, i + chunkSize));
    }
    for (const chunk of deleteBatches) {
      await Promise.all(
        chunk.map((name) =>
          bucket
            .file(name)
            .delete()
            .catch((error) => {
              console.warn('[cleanup-showcase] Failed to delete file:', name, error?.message || error);
            }),
        ),
      );
    }
    console.log(`[cleanup-showcase] Deleted unused storage files: ${unusedFiles.length}`);
  }
};

run().catch((error) => {
  console.error('[cleanup-showcase] Failed:', error);
  process.exit(1);
});
