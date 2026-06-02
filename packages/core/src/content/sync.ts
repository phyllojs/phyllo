import { loadProject } from '../config/project';

import { contentPaths } from './paths';
import { writeTypes } from './types';

import { scanContent } from './index';

/**
 * 只生成内容类型声明，不编译正文。
 *
 * @param directory - 站点根目录，默认为当前目录。
 * @returns 写入的文件路径。
 */
export async function sync(directory = '.'): Promise<string> {
  const project = await loadProject(directory);

  return writeTypes(project, contentPaths(await scanContent(project.content)));
}
