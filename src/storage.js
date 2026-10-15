import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { SusuError, validateGroup } from './domain.js';

export async function loadGroup(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  let saved;
  try {
    saved = JSON.parse(contents);
  } catch {
    throw new SusuError(`Cannot read ${filePath}: the saved data is not valid JSON.`);
  }

  if (!saved || saved.version !== 1) {
    throw new SusuError(`Cannot read ${filePath}: the save format is unsupported.`);
  }
  return validateGroup(saved.group);
}

export async function saveGroup(filePath, group) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({ version: 1, group }, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}
