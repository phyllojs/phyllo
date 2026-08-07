import { executeCommand } from 'create-phyllo';
import { Command } from 'rebake';

/**
 * phyllo sync 命令。
 */
@Command({
  name: 'sync',
  args: '[directory]',
  description: 'Generate content directory types',
})
export class SyncCommand {
  /**
   * @param directory - 站点根目录，默认为当前目录。
   * @param extraArguments - Rebake 传入的多余参数。
   */
  public constructor(directory = '.', ...extraArguments: string[]) {
    executeCommand(async () => {
      const { sync } = await import('@phyllo/core');
      const path = await sync(directory);

      console.log(`Generated ${path}`);
    }, extraArguments);
  }
}
