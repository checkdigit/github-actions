// publish-beta/copy-files.ts
import path from 'node:path';
import fs from 'node:fs/promises';

// copy all non .ts files from src to dist directory recursively
export default async function copyNonTSFiles(sourceDirectory: string, destinationDirectory: string): Promise<void> {
  const files = await fs.readdir(sourceDirectory, { withFileTypes: true });
  await Promise.all(
    files.map(async (item) => {
      const sourceItem = path.join(sourceDirectory, item.name);
      const destinationItem = path.join(destinationDirectory, item.name);
      if (item.isDirectory()) {
        await fs.mkdir(destinationItem, { recursive: true });
        await copyNonTSFiles(sourceItem, path.join(destinationDirectory, item.name));
        return;
      }
      if (!item.name.endsWith('.ts')) {
        await fs.copyFile(sourceItem, destinationItem);
      }
    })
  );
}
