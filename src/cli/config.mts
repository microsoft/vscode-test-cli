/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { existsSync, promises as fs } from 'fs';

import { dirname, extname, isAbsolute, join, resolve as resolvePath } from 'path';
import { pathToFileURL } from 'url';
import {
  IConfigurationWithGlobalOptions,
  ICoverageConfiguration,
  TestConfiguration,
} from '../config.cjs';
import { CliExpectedError } from './error.mjs';
import { mustResolve } from './resolver.mjs';
import { ensureArray } from './util.mjs';

type ConfigOrArray = IConfigurationWithGlobalOptions | TestConfiguration | TestConfiguration[];

const configFileRules: {
  [ext: string]: (path: string) => Promise<ConfigOrArray | Promise<ConfigOrArray>>;
} = {
  json: (path: string) => fs.readFile(path, 'utf8').then(JSON.parse),
  js: (path) => import(pathToFileURL(path).toString()),
  mjs: (path) => import(pathToFileURL(path).toString()),
};

/** Loads the default config based on the process working directory. */
export async function loadDefaultConfigFile(): Promise<ResolvedTestConfiguration> {
  const base = '.vscode-test';

  let dir = process.cwd();
  while (true) {
    for (const ext of Object.keys(configFileRules)) {
      const candidate = join(dir, `${base}.${ext}`);
      if (existsSync(candidate)) {
        return tryLoadConfigFile(candidate);
      }
    }

    const next = dirname(dir);
    if (next === dir) {
      break;
    }

    dir = next;
  }

  throw new CliExpectedError(
    `Could not find a ${base} file in this directory or any parent. You can specify one with the --config option.`,
  );
}

/** Loads a specific config file by the path, throwing if loading fails. */
export async function tryLoadConfigFile(path: string): Promise<ResolvedTestConfiguration> {
  if (!isAbsolute(path)) {
    path = resolvePath(path);
  }

  const ext = extname(path).slice(1);
  if (!configFileRules.hasOwnProperty(ext)) {
    throw new CliExpectedError(
      `I don't know how to load the extension '${ext}'. We can load: ${Object.keys(
        configFileRules,
      ).join(', ')}`,
    );
  }

  try {
    let loaded = await configFileRules[ext](path);
    if ('default' in loaded) {
      // handle default es module exports
      loaded = (loaded as { default: TestConfiguration }).default;
    }
    // allow returned promises to resolve:
    loaded = await loaded;

    if (typeof loaded === 'object' && 'tests' in loaded) {
      return await ResolvedTestConfiguration.load(loaded, path);
    }

    return await ResolvedTestConfiguration.load({ tests: ensureArray(loaded) }, path);
  } catch (e) {
    throw new CliExpectedError(`Could not read config file ${path}: ${(e as Error).stack || e}`);
  }
}

export class ResolvedTestConfiguration implements IConfigurationWithGlobalOptions {
  public readonly tests: TestConfiguration[];
  public readonly coverage: ICoverageConfiguration | undefined;
  /** Directory name the configuration file resides in. */
  public readonly dir: string;

  public static async load(config: IConfigurationWithGlobalOptions, path: string) {
    // Resolve all mocha `require` locations relative to the configuration file,
    // since these are otherwise relative to the runner which is opaque to the user.
    const resolved = resolvePath(path);
    const dir = dirname(resolved);
    for (const test of config.tests) {
      if (test.mocha?.require) {
        test.mocha.require = await Promise.all(
          ensureArray(test.mocha.require).map((f) => mustResolve(dir, f)),
        );
      }
    }

    return new ResolvedTestConfiguration(config, path);
  }

  protected constructor(
    config: IConfigurationWithGlobalOptions,
    public readonly path: string,
  ) {
    this.coverage = config.coverage;
    this.tests = config.tests;
    this.dir = dirname(path);
  }

  /**
   * Gets the resolved extension development path for the test configuration.
   */
  public extensionDevelopmentPath(test: TestConfiguration) {
    return ensureArray(test.extensionDevelopmentPath?.slice() || this.dir).map((p) =>
      isAbsolute(p) ? p : join(this.dir, p),
    );
  }
}
