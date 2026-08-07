import { executeCommand } from 'create-phyllo';
import { Command, Option } from 'rebake';

/**
 * phyllo dev 命令。
 */
@Command({
  name: 'dev',
  args: '[directory]',
  description: 'Start the Bun development server',
})
export class DevCommand {
  @Option({ short: 'p', description: 'Server port' })
  public static port = '3000';

  @Option({ description: 'Server hostname' })
  public static host = 'localhost';

  /**
   * @param directory - 站点根目录，默认为当前目录。
   * @param extraArguments - Rebake 传入的多余参数。
   */
  public constructor(directory = '.', ...extraArguments: string[]) {
    executeCommand(async () => {
      const port = Number(DevCommand.port);

      if (!/^\d+$/.test(DevCommand.port) || port > 65535) {
        throw new Error('Port must be an integer between 0 and 65535.');
      }
      const { dev } = await import('@phyllo/core');
      const instance = await dev(directory, {
        port,
        hostname: DevCommand.host,
      });
      const stop = () => {
        instance.stop().catch(console.error);
      };

      console.log(`Phyllo → ${instance.url}`);
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);

      try {
        process.exitCode = await instance.exited;
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    }, extraArguments);
  }
}
