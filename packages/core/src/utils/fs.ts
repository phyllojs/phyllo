import { file, write } from 'bun';
import { realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * 内容不变时不写入，避免触发文件监听和热更新。
 *
 * @param path - 目标文件路径。
 * @param source - 期望写入的内容。
 */
export async function writeIfChanged(path: string, source: string) {
  const target = file(path);

  if (!(await target.exists()) || (await target.text()) !== source) {
    await write(target, source);
  }
}

/**
 * 解析真实路径，不存在的部分按原样拼接。
 *
 * @param path - 待解析的路径。
 * @returns 规范化后的绝对路径。
 */
export async function resolvePath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return join(await resolvePath(dirname(path)), basename(path));
  }
}
