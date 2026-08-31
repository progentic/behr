import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, open, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AssetFileOperations,
  createAssetStorage,
} from "./asset-storage";

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_KEY = `${SITE_ID}/${ASSET_ID}`;
const createdRoots: string[] = [];

afterEach(async () => {
  for (const root of createdRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("AssetStorage", () => {
  test("writes exact bytes under the system storage key", async () => {
    const root = await createTemporaryRoot();
    const storage = createAssetStorage(root);
    const bytes = new TextEncoder().encode("asset bytes");

    const stored = await storage.writeOriginal(SITE_ID, ASSET_ID, bytes);

    expect(stored).toEqual({ storageKey: STORAGE_KEY, byteSize: bytes.length });
    expect(Array.from(await readFile(join(root, SITE_ID, ASSET_ID)))).toEqual(
      Array.from(bytes),
    );
    expect(stored.storageKey).not.toContain("original-name.txt");
  });

  test("preserves a pre-existing file after an exclusive collision", async () => {
    const root = await createTemporaryRoot();
    const storage = createAssetStorage(root);
    const original = new TextEncoder().encode("original bytes");
    const replacement = new TextEncoder().encode("replacement bytes");
    await storage.writeOriginal(SITE_ID, ASSET_ID, original);

    expect(
      storage.writeOriginal(SITE_ID, ASSET_ID, replacement),
    ).rejects.toThrow();
    expect(Array.from(await readFile(join(root, SITE_ID, ASSET_ID)))).toEqual(
      Array.from(original),
    );
  });

  test("removes an original only through its internal storage key", async () => {
    const root = await createTemporaryRoot();
    const storage = createAssetStorage(root);
    await storage.writeOriginal(
      SITE_ID,
      ASSET_ID,
      new TextEncoder().encode("temporary bytes"),
    );

    await storage.removeOriginal(STORAGE_KEY);

    expect(await Bun.file(join(root, SITE_ID, ASSET_ID)).exists()).toBe(false);
    expect(storage.removeOriginal("../../outside")).rejects.toThrow();
  });

  test("reads exact bytes through the confined storage key", async () => {
    const root = await createTemporaryRoot();
    const storage = createAssetStorage(root);
    const bytes = new TextEncoder().encode("readable bytes");
    await storage.writeOriginal(SITE_ID, ASSET_ID, bytes);

    expect(Array.from(await storage.readOriginal(STORAGE_KEY))).toEqual(
      Array.from(bytes),
    );
    expect(storage.readOriginal("../../outside")).rejects.toThrow();
  });

  test("removes a partial file created by a failed write", async () => {
    const root = await createTemporaryRoot();
    const storage = createAssetStorage(root, createFailingWriteOperations());

    expect(
      storage.writeOriginal(
        SITE_ID,
        ASSET_ID,
        new TextEncoder().encode("partial bytes"),
      ),
    ).rejects.toThrow("simulated write failure");
    expect(await Bun.file(join(root, SITE_ID, ASSET_ID)).exists()).toBe(false);
  });
});

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "behr-asset-storage-"));
  createdRoots.push(root);
  return root;
}

function createFailingWriteOperations(): AssetFileOperations {
  return {
    createDirectory: async (path) => {
      await mkdir(path, { recursive: true });
    },
    openExclusive: async (path) => {
      const handle = await open(path, "wx");
      return {
        writeFile: async (bytes) => {
          await handle.writeFile(bytes.subarray(0, 1));
          throw new Error("simulated write failure");
        },
        close: async () => {
          await handle.close();
        },
      };
    },
    removeFile: async (path) => {
      await unlink(path);
    },
    readFile: async (path) => await readFile(path),
  };
}
