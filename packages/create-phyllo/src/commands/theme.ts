import { basename, resolve } from 'node:path';

import { Command, Option } from 'rebake';

import { executeCommand } from '../execute-command';
import { createTheme } from '../theme';

/**
 * phyllo theme 命令。
 */
@Command({
  name: 'theme',
  args: '<directory>',
  description: 'Create a theme package template',
})
export class ThemeCommand {
  @Option({ short: 'n', description: 'Theme package name' })
  public static package = '';

  /**
   * @param directory - 主题目录，省略时提示指定目录。
   * @param extraArguments - Rebake 传入的多余参数。
   */
  public constructor(directory?: string, ...extraArguments: string[]) {
    executeCommand(async () => {
      if (!directory) {
        throw new Error('Specify a directory: phyllo theme themes/my-theme');
      }
      const name =
        ThemeCommand.package || `phyllo-theme-${basename(resolve(directory))}`;
      const root = await createTheme(directory, name);

      console.log(`Created theme ${name} → ${root}`);

      console.log(
        `Add it to your site's workspace dependencies and set theme to "${name}".`,
      );
    }, extraArguments);
  }
}
