#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { applicationDefault, cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const args = process.argv.slice(2);
const getFlagValue = (flag) => {
  const entry = args.find((arg) => arg.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
};
const hasFlag = (flag) => args.includes(flag);
const readJson = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const repoRoot = process.cwd();
const firebaseRc = readJson(path.join(repoRoot, '.firebaserc'));
const credentialsPath = getFlagValue('--credentials') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = credentialsPath ? readJson(credentialsPath) : null;
const projectId = getFlagValue('--project') || serviceAccount?.project_id || firebaseRc?.projects?.default;
const bucketName = getFlagValue('--bucket') || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
const listAll = hasFlag('--list-all');
const listLimit = Number.parseInt(getFlagValue('--limit') || '100', 10);
const apply = hasFlag('--apply');
const removePublicAcl = hasFlag('--remove-public-acl');
const removeDownloadTokens = hasFlag('--remove-download-tokens');
const updateFirestorePaths = hasFlag('--update-firestore-paths');
const expectedPathUpdates = getFlagValue('--expected-path-updates');

if (!projectId) {
  console.error('[storage-privacy] Project is required. Pass --project=PROJECT_ID.');
  process.exit(1);
}
if (credentialsPath && !serviceAccount) {
  console.error('[storage-privacy] Could not read credentials:', credentialsPath);
  process.exit(1);
}
if (!apply && (removePublicAcl || removeDownloadTokens || updateFirestorePaths)) {
  console.error('[storage-privacy] Mutation flags require --apply. No changes were made.');
  process.exit(1);
}

const app = initializeApp({
  credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
  projectId,
  storageBucket: bucketName,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const normalizePath = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^\/+/, '');
  return /^(galleries|showcase)\//.test(normalized) && !normalized.includes('..') ? normalized : null;
};

const pathFromUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  try {
    if (rawUrl.startsWith('gs://')) {
      const value = rawUrl.slice(5);
      const slashIndex = value.indexOf('/');
      return slashIndex >= 0 && value.slice(0, slashIndex) === bucketName
        ? normalizePath(decodeURIComponent(value.slice(slashIndex + 1))) : null;
    }
    const url = new URL(rawUrl);
    if (url.hostname === 'storage.googleapis.com') {
      const parts = url.pathname.replace(/^\/+/, '').split('/');
      return parts.length > 1 && decodeURIComponent(parts[0]) === bucketName
        ? normalizePath(decodeURIComponent(parts.slice(1).join('/'))) : null;
    }
    if (url.hostname === 'firebasestorage.googleapis.com' || url.hostname === 'localhost') {
      const match = url.pathname.match(/\/b\/([^/]+)\/o\/(.+)$/);
      return match && decodeURIComponent(match[1]) === bucketName
        ? normalizePath(decodeURIComponent(match[2])) : null;
    }
  } catch {
    return null;
  }
  return null;
};

const addMissingArtworkPaths = (images) => {
  let changed = false;
  const nextImages = images.map((image) => {
    if (!image || typeof image !== 'object' || Array.isArray(image)) return image;
    const next = { ...image };
    if (!image.storagePath) {
      const storagePath = pathFromUrl(image.url);
      if (storagePath) {
        next.storagePath = storagePath;
        changed = true;
      }
    }
    if (!image.thumbnailPath) {
      const thumbnailPath = pathFromUrl(image.thumbnailUrl);
      if (thumbnailPath) {
        next.thumbnailPath = thumbnailPath;
        changed = true;
      }
    }
    return next;
  });
  return { changed, nextImages };
};

const printList = (label, values) => {
  console.log(`${label}: ${values.length}`);
  const shown = listAll ? values : values.slice(0, listLimit);
  shown.forEach((value) => console.log(`- ${value}`));
  if (shown.length < values.length) {
    console.log(`... ${values.length - shown.length} more (use --list-all)`);
  }
};

const run = async () => {
  console.log('[storage-privacy] Project:', projectId);
  console.log('[storage-privacy] Bucket:', bucketName);
  console.log('[storage-privacy] Mode:', apply ? 'APPLY' : 'DRY-RUN');

  const [artworksSnapshot, showcaseSnapshot, galleryFilesResult, showcaseFilesResult] = await Promise.all([
    db.collection('artworks').get(),
    db.collection('showcaseGalleries').get(),
    bucket.getFiles({ prefix: 'galleries/' }),
    bucket.getFiles({ prefix: 'showcase/' }),
  ]);

  const references = new Map();
  const addReference = (storagePath, label) => {
    const normalized = normalizePath(storagePath);
    if (!normalized) return;
    const labels = references.get(normalized) || [];
    labels.push(label);
    references.set(normalized, labels);
  };
  const artworkUpdates = [];
  artworksSnapshot.docs.forEach((snapshot) => {
    const data = snapshot.data();
    const images = Array.isArray(data.images) ? data.images : [];
    images.forEach((image, index) => {
      if (!image || typeof image !== 'object') return;
      const storagePath = normalizePath(image.storagePath) || pathFromUrl(image.url);
      const thumbnailPath = normalizePath(image.thumbnailPath) || pathFromUrl(image.thumbnailUrl);
      addReference(storagePath, `artworks/${snapshot.id}.images[${index}].storagePath`);
      addReference(thumbnailPath, `artworks/${snapshot.id}.images[${index}].thumbnailPath`);
    });
    if (addMissingArtworkPaths(images).changed) {
      artworkUpdates.push({ ref: snapshot.ref, label: `artworks/${snapshot.id}` });
    }
  });

  const showcaseUpdates = [];
  showcaseSnapshot.docs.forEach((snapshot) => {
    const data = snapshot.data();
    const overviewImagePath = normalizePath(data.overviewImagePath) || pathFromUrl(data.overviewImageUrl);
    const overviewImageThumbPath = normalizePath(data.overviewImageThumbPath) || pathFromUrl(data.overviewImageThumbUrl);
    addReference(overviewImagePath, `showcaseGalleries/${snapshot.id}.overviewImagePath`);
    addReference(overviewImageThumbPath, `showcaseGalleries/${snapshot.id}.overviewImageThumbPath`);
    const update = {};
    if (overviewImagePath && !data.overviewImagePath) update.overviewImagePath = overviewImagePath;
    if (overviewImageThumbPath && !data.overviewImageThumbPath) update.overviewImageThumbPath = overviewImageThumbPath;
    if (Object.keys(update).length > 0) showcaseUpdates.push({ ref: snapshot.ref, label: `showcaseGalleries/${snapshot.id}`, update });
  });

  const files = [...galleryFilesResult[0], ...showcaseFilesResult[0]];
  const objectNames = new Set(files.map((file) => file.name));
  const publicObjects = [];
  const tokenObjects = [];
  for (const file of files) {
    try {
      const [metadata] = await file.getMetadata();
      const acl = Array.isArray(metadata.acl) ? metadata.acl : [];
      if (acl.some((entry) => entry.entity === 'allUsers' || entry.entity === 'allAuthenticatedUsers')) {
        publicObjects.push(file.name);
      }
      if (metadata.metadata?.firebaseStorageDownloadTokens) {
        tokenObjects.push(file.name);
      }
    } catch (error) {
      throw new Error(`Failed to inspect object ${file.name}: ${error.message || error}`);
    }
  }

  const orphanObjects = files.map((file) => file.name).filter((name) => !references.has(name));
  const missingObjects = [...references.keys()].filter((name) => !objectNames.has(name));
  const legacyUrlDocs = [
    ...artworkUpdates.map((entry) => entry.label),
    ...showcaseUpdates.map((entry) => entry.label),
  ];

  if (apply && updateFirestorePaths) {
    const expected = Number(expectedPathUpdates);
    if (expectedPathUpdates === null || !Number.isSafeInteger(expected) || expected < 0 || expected !== legacyUrlDocs.length) {
      throw new Error(`Expected ${expectedPathUpdates || 'an explicit count'} path updates, found ${legacyUrlDocs.length}. No changes were made.`);
    }
    if (missingObjects.length > 0) {
      throw new Error(`${missingObjects.length} referenced Storage objects are missing. No changes were made.`);
    }
  }

  printList('Public ACL objects', publicObjects);
  printList('Firebase download token objects', tokenObjects);
  printList('Firestore documents needing path fields', legacyUrlDocs);
  printList('Objects not referenced by Firestore', orphanObjects);
  printList('Firestore paths missing in Storage', missingObjects);

  if (!apply) {
    console.log('[storage-privacy] Dry run complete. No ACL, metadata, or Firestore data was changed.');
    return;
  }
  if (!removePublicAcl && !removeDownloadTokens && !updateFirestorePaths) {
    console.log('[storage-privacy] No mutation flag selected. Nothing changed.');
    return;
  }

  if (removePublicAcl) {
    for (const name of publicObjects) {
      try {
        await bucket.file(name).makePrivate({ strict: true });
        console.log('[storage-privacy] Removed public ACL:', name);
      } catch (error) {
        throw new Error(`Failed to remove public ACL from ${name}: ${error.message || error}`);
      }
    }
  }
  if (removeDownloadTokens) {
    for (const name of tokenObjects) {
      try {
        const file = bucket.file(name);
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
        console.log('[storage-privacy] Removed download token metadata:', name);
      } catch (error) {
        throw new Error(`Failed to remove download token from ${name}: ${error.message || error}`);
      }
    }
  }
  if (updateFirestorePaths) {
    for (const entry of artworkUpdates) {
      const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(entry.ref);
        if (!snapshot.exists) throw new Error(`Document disappeared: ${entry.label}`);
        const currentImages = Array.isArray(snapshot.get('images')) ? snapshot.get('images') : [];
        const { changed, nextImages } = addMissingArtworkPaths(currentImages);
        nextImages.forEach((image, index) => {
          if (!image || typeof image !== 'object') return;
          for (const field of ['storagePath', 'thumbnailPath']) {
            if (!currentImages[index][field] && image[field] && !objectNames.has(image[field])) {
              throw new Error(`Storage object missing for ${entry.label}.images[${index}].${field}: ${image[field]}`);
            }
          }
        });
        if (changed) transaction.update(entry.ref, { images: nextImages });
        return changed;
      });
      if (updated) console.log('[storage-privacy] Added artwork path fields:', entry.label);
    }
    for (const entry of showcaseUpdates) {
      const updated = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(entry.ref);
        if (!snapshot.exists) throw new Error(`Document disappeared: ${entry.label}`);
        const data = snapshot.data();
        const update = {};
        if (!data.overviewImagePath) {
          const storagePath = pathFromUrl(data.overviewImageUrl);
          if (storagePath) update.overviewImagePath = storagePath;
        }
        if (!data.overviewImageThumbPath) {
          const thumbnailPath = pathFromUrl(data.overviewImageThumbUrl);
          if (thumbnailPath) update.overviewImageThumbPath = thumbnailPath;
        }
        for (const storagePath of Object.values(update)) {
          if (!objectNames.has(storagePath)) {
            throw new Error(`Storage object missing for ${entry.label}: ${storagePath}`);
          }
        }
        if (Object.keys(update).length > 0) transaction.update(entry.ref, update);
        return Object.keys(update).length > 0;
      });
      if (updated) console.log('[storage-privacy] Added showcase path fields:', entry.label);
    }
  }
};

run().catch((error) => {
  console.error('[storage-privacy] Failed:', error);
  process.exit(1);
});
