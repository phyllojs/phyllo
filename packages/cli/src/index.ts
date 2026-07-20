#!/usr/bin/env bun

import { InitCommand, ThemeCommand } from 'create-phyllo';
import { execute, Program } from 'rebake';

import { description, version } from '../package.json';

import { BuildCommand } from './commands/build';
import { DevCommand } from './commands/dev';
import { SyncCommand } from './commands/sync';

/**
 * Phyllo 命令行入口。
 */
@Program({
  name: 'phyllo',
  description,
  version,
  commands: [InitCommand, DevCommand, BuildCommand, SyncCommand, ThemeCommand],
})
class Phyllo {}

execute(Phyllo);
