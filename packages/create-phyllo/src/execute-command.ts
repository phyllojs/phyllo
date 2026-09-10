/**
 * 执行命令并统一处理错误。
 *
 * @remarks
 * Rebake 0.1 通过同步构造函数执行命令，这里统一等待异步操作并处理错误。
 *
 * @param action - 命令的异步操作。
 * @param extraArguments - Rebake 传入的多余参数。
 */
export async function executeCommand(
  action: () => Promise<unknown>,
  extraArguments: string[],
): Promise<void> {
  try {
    if (extraArguments.length) {
      throw new Error('Expected at most one directory argument.');
    }
    await action();
  } catch (error) {
    console.error(
      error instanceof AggregateError
        ? `${error.message}\n${error.errors.join('\n')}`
        : error instanceof Error
          ? error.message
          : error,
    );
    process.exitCode = 1;
  }
}
