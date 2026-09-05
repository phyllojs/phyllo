import { devEngines } from '../package.json';

import {
  copyTemplate,
  prepareDirectory,
  templateJson,
  validatePackageName,
} from './scaffold';

/**
 * 创建主题包模板。
 *
 * @param directory - 目标目录。
 * @param name - 主题包名。
 * @returns 主题根目录的绝对路径。
 * @throws 包名不合法或目录非空时抛出错误。
 */
export async function createTheme(
  directory: string,
  name: string,
): Promise<string> {
  validatePackageName(name);

  const root = await prepareDirectory(directory);

  await copyTemplate('theme', root, {
    NAME: name,
    DEV_ENGINES: templateJson(devEngines),
  });

  return root;
}
