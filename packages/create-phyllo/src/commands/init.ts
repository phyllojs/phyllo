import { basename, relative } from 'node:path';

import { Command, Option } from 'rebake';
import { input } from 'rebake/prompts';

import { executeCommand } from '../execute-command';
import { createProject } from '../project';
import { isValidPackageName } from '../scaffold';

/**
 * phyllo init 命令。
 */
@Command({
  name: 'init',
  args: '[directory]',
  description: 'Create a writing project',
})
export class InitCommand {
  @Option({ short: 't', description: 'Theme package name' })
  public static theme = '';

  /**
   * @param directory - 站点目录，省略时询问项目名称。
   * @param extraArguments - Rebake 传入的多余参数。
   */
  public constructor(directory?: string, ...extraArguments: string[]) {
    executeCommand(async () => {
      const target =
        directory ??
        input('Project name', {
          default: 'my-site',
          validate: value =>
            isValidPackageName(basename(value)) ||
            'Use lowercase letters, numbers, and hyphens, such as my-site.',
        });

      if (!target) {
        throw new Error('Project creation cancelled.');
      }
      const root = await createProject(target, InitCommand.theme);

      const local = relative(process.cwd(), root);
      const location = local && !local.startsWith('..') ? local : root;

      console.log(`Created ${root}`);

      console.log(
        `Next: cd ${JSON.stringify(location)} && bun install && bun run dev`,
      );
    }, extraArguments);
  }
}
