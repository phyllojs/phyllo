#!/usr/bin/env bun

import { argv } from 'bun';

import { execute, Program } from 'rebake';

import { description, version } from '../package.json';

import { InitCommand } from './commands/init';

export { InitCommand } from './commands/init';
export { ThemeCommand } from './commands/theme';
export { createProject } from './project';
export { createTheme } from './theme';
export { executeCommand } from './execute-command';

if (import.meta.main) {
  /**
   * create-phyllo 命令行入口。
   */
  @Program({
    name: 'create-phyllo',
    description,
    version,
    commands: [InitCommand],
  })
  class CreatePhyllo {}

  const args = argv.slice(2);
  const [command] = args;

  // Rebake 0.1 没有默认命令，这里补上 init；查询版本时直接交给 Rebake 处理。
  execute(
    CreatePhyllo,
    command === 'init' || command === '--version' || command === '-v'
      ? args
      : ['init', ...args],
  );
}
