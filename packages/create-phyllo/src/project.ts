import { basename, join } from 'node:path';

import { input, select } from 'rebake/prompts';

import { devEngines } from '../package.json';

import {
  copyTemplate,
  isValidPackageName,
  prepareDirectory,
  templateJson,
  validatePackageName,
} from './scaffold';
import { createTheme } from './theme';

/**
 * 站点主题选择结果。
 */
interface ThemeChoice {
  /** 主题包名。 */
  name: string;
  /** 本地主题目录名，使用内置主题时省略。 */
  local?: string;
}

/**
 * 通过交互选择站点主题。
 *
 * @returns 主题包名与可选的本地主题目录名。
 * @throws 用户取消选择时抛出错误。
 */
function chooseTheme(): ThemeChoice {
  const choice = select('Choose a theme', [
    { label: 'Documentation', value: 'phyllo-theme-docs' },
    { label: 'Custom theme', value: 'custom' },
  ]);

  if (!choice) {
    throw new Error('Project creation cancelled.');
  }

  if (choice.value !== 'custom') {
    return { name: choice.value };
  }
  const local = input('Theme name', {
    validate: value =>
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
      'Use lowercase letters, numbers, and hyphens, such as my-theme.',
  });

  if (!local) {
    throw new Error('Project creation cancelled.');
  }
  return { name: `phyllo-theme-${local}`, local };
}

/**
 * 创建站点工程：复制站点模板并生成配置与依赖清单。
 *
 * @param directory - 目标目录。
 * @param theme - 主题包名，省略时进入交互选择。
 * @returns 站点根目录的绝对路径。
 * @throws 目录非空、包名不合法或用户取消时抛出错误。
 */
export async function createProject(
  directory: string,
  theme?: string,
): Promise<string> {
  const root = await prepareDirectory(directory);
  const name = basename(root);

  if (!isValidPackageName(name)) {
    throw new Error(
      `The project directory name must be a valid npm package name: ${name}. Use lowercase letters, numbers, and hyphens, such as my-site.`,
    );
  }
  const choice = theme ? { name: theme } : chooseTheme();

  validatePackageName(choice.name);

  await copyTemplate('site', root, {
    NAME: name,
    THEME: choice.name,
    THEME_VERSION: choice.local ? 'workspace:*' : 'latest',
    DEV_ENGINES: templateJson(devEngines),
  });

  if (choice.local) {
    await createTheme(join(root, 'themes', choice.local), choice.name);
  }
  return root;
}
