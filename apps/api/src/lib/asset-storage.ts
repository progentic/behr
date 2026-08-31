import { assetIdSchema, siteIdSchema } from "@bher/contracts";
import { mkdir, open, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type StoredOriginal = Readonly<{
  storageKey: string;
  byteSize: number;
}>;

export type AssetStorage = Readonly<{
  writeOriginal: (
    siteId: string,
    assetId: string,
    bytes: Uint8Array,
  ) => Promise<StoredOriginal>;
  removeOriginal: (storageKey: string) => Promise<void>;
}>;

type AssetFileHandle = Readonly<{
  writeFile: (bytes: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}>;

export type AssetFileOperations = Readonly<{
  createDirectory: (path: string) => Promise<void>;
  openExclusive: (path: string) => Promise<AssetFileHandle>;
  removeFile: (path: string) => Promise<void>;
}>;

type StorageLocation = Readonly<{
  storageKey: string;
  physicalPath: string;
}>;

const NODE_ASSET_FILE_OPERATIONS: AssetFileOperations = Object.freeze({
  createDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  openExclusive: async (path) => await open(path, "wx"),
  removeFile: async (path) => {
    await unlink(path);
  },
});

export function createAssetStorage(
  storageRoot: string,
  operations: AssetFileOperations = NODE_ASSET_FILE_OPERATIONS,
): AssetStorage {
  if (!isAbsolute(storageRoot)) {
    throw new Error("Asset storage root must be absolute.");
  }
  const root = resolve(storageRoot);
  return Object.freeze({
    writeOriginal: (siteId, assetId, bytes) =>
      writeOriginal(root, siteId, assetId, bytes, operations),
    removeOriginal: (storageKey) =>
      removeOriginal(root, storageKey, operations),
  });
}

async function writeOriginal(
  storageRoot: string,
  siteId: string,
  assetId: string,
  bytes: Uint8Array,
  operations: AssetFileOperations,
): Promise<StoredOriginal> {
  const location = createStorageLocation(storageRoot, siteId, assetId);
  await operations.createDirectory(dirname(location.physicalPath));
  await writeExclusiveFile(location.physicalPath, bytes, operations);
  return { storageKey: location.storageKey, byteSize: bytes.byteLength };
}

async function removeOriginal(
  storageRoot: string,
  storageKey: string,
  operations: AssetFileOperations,
): Promise<void> {
  const location = resolveStorageKey(storageRoot, storageKey);
  await operations.removeFile(location.physicalPath);
}

function createStorageLocation(
  storageRoot: string,
  siteId: string,
  assetId: string,
): StorageLocation {
  const validSiteId = siteIdSchema.parse(siteId);
  const validAssetId = assetIdSchema.parse(assetId);
  const storageKey = `${validSiteId}/${validAssetId}`;
  return {
    storageKey,
    physicalPath: resolveConfinedPath(storageRoot, storageKey),
  };
}

function resolveStorageKey(
  storageRoot: string,
  storageKey: string,
): StorageLocation {
  const parts = storageKey.split("/");
  if (parts.length !== 2) {
    throw new Error("Asset storage key is invalid.");
  }
  return createStorageLocation(storageRoot, parts[0] ?? "", parts[1] ?? "");
}

function resolveConfinedPath(storageRoot: string, storageKey: string): string {
  const physicalPath = resolve(storageRoot, storageKey);
  const relativePath = relative(storageRoot, physicalPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Asset storage key is outside the configured root.");
  }
  return physicalPath;
}

async function writeExclusiveFile(
  physicalPath: string,
  bytes: Uint8Array,
  operations: AssetFileOperations,
): Promise<void> {
  const handle = await operations.openExclusive(physicalPath);
  try {
    await handle.writeFile(bytes);
    await handle.close();
  } catch (error) {
    await closeAfterFailure(handle);
    await operations.removeFile(physicalPath);
    throw error;
  }
}

async function closeAfterFailure(handle: AssetFileHandle): Promise<void> {
  try {
    await handle.close();
  } catch {
    // Removal is still required after a close failure.
  }
}
