/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { TestConfiguration } from '../../config.cjs';
import { CliArgs } from '../args.js';
import { ResolvedTestConfiguration } from '../resolver.mjs';
import { DesktopPlatform } from './desktop.mjs';

export interface IPlatform {
  /**
   * Prepares for a test run. This is called once for any CLI invokation, and
   * the resulting `run()` may be called multiple times e.g. in a watch scenario.
   */
  prepare(args: CliArgs, config: ResolvedTestConfiguration, test: TestConfiguration): Promise<IPreparedRun | undefined>;
}

export interface IPreparedRun {
  /** Executes the run, returning the exit code (non-zero indicates failure) */
  run(): Promise<number>;

  /** Dumps the prepared configuration as a JSON object for introspection. */
  dumpJson(): object;
}

export const platforms: IPlatform[] = [
  new DesktopPlatform()
];
