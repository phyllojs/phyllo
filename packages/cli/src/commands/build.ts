import { executeCommand } from 'create-phyllo';
import { Command } from 'rebake';

/**
 * phyllo build 命令。
 */
@Command({
  name: 'build',
  args: '[directory]',
  description: 'Build the static site',
})
export class BuildCommand {
  /**
   * @param directory - 站点根目录，默认为当前目录。
   * @param extraArguments - Rebake 传入的多余参数。
   */
  public constructor(directory = '.', ...extraArguments: string[]) {
    executeCommand(async () => {
      const { build } = await import('@phyllo/core');
      const result = await build(directory);

      console.log(`Built ${result.pages} pages → ${result.outdir}`);
    }, extraArguments);
  }
}
