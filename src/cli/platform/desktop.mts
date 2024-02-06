/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import resolveCb from 'enhanced-resolve';
import { dirname, resolve as resolvePath } from 'path';
import supportsColor from 'supports-color';
import { fileURLToPath, pathToFileURL } from 'url';
import { promisify } from 'util';
import { IDesktopTestConfiguration, TestConfiguration } from '../../config.cjs';
import { CliArgs } from '../args.js';
import { CliExpectedError } from '../error.mjs';
import { gatherFiles } from '../gatherFiles.mjs';
import { ResolvedTestConfiguration } from '../resolver.mjs';
import { ensureArray } from '../util.js';
import { IPlatform, IPreparedRun } from './index.mjs';

const resolveModule = promisify(resolveCb);

/**
 * Resolves the module in context of the configuration.
 *
 * Only does traditional Node resolution without looking at the `exports` field
 * or alternative extensions (cjs/mjs) to match what the VS Code loader does.
 */
const mustResolve = async (config: ResolvedTestConfiguration, moduleName: string) => {
  console.log('resolve', moduleName, config.path);
  const path = await resolveModule(dirname(config.path), moduleName);
  if (!path) {
    let msg = `Could not resolve module "${moduleName}" in ${path}`;
    if (!moduleName.startsWith('.')) {
      msg += ' (you may need to install with `npm install`)';
    }

    throw new CliExpectedError(msg);
  }

  return path;
};

export class DesktopPlatform implements IPlatform {
  /** @inheritdoc */
  public async prepare(
    args: CliArgs,
    config: ResolvedTestConfiguration,
    _test: TestConfiguration,
  ): Promise<IPreparedRun | undefined> {
    if (_test.platform && _test.platform !== 'desktop') {
      return undefined;
    }

    const test = structuredClone(_test);
    test.launchArgs ||= [];
    if (test.workspaceFolder) {
      test.launchArgs.push(resolvePath(dirname(config.path), test.workspaceFolder));
    }

    if (args.run?.length) {
      test.files = args.run.map((r) => resolvePath(process.cwd(), String(r)));
    }

    const preload = await Promise.all(
      [...ensureArray(test.mocha?.preload || []), ...ensureArray(args.file || [])].map((p) =>
        mustResolve(config, String(p)),
      ),
    );

    const testEnvOptions = JSON.stringify({
      mochaOpts: { ...args, ...test.mocha },
      colorDefault: supportsColor.stdout || process.env.MOCHA_COLORS !== undefined,
      preload,
      files: await gatherFiles(config.path, test),
    });

    return new PreparedDesktopRun(args, config, test, testEnvOptions);
  }
}

class PreparedDesktopRun implements IPreparedRun {
  private get extensionDevelopmentPath() {
    return this.test.extensionDevelopmentPath?.slice() || dirname(this.config.path);
  }
  private get extensionTestsPath() {
    return resolvePath(fileURLToPath(new URL('.', import.meta.url)), '../../runner.cjs');
  }
  private get env() {
    return {
      ...this.test.env,
      VSCODE_TEST_OPTIONS: this.testEnvOptions,
      ELECTRON_RUN_AS_NODE: undefined,
    };
  }

  constructor(
    private readonly args: CliArgs,
    private readonly config: ResolvedTestConfiguration,
    private readonly test: IDesktopTestConfiguration,
    private readonly testEnvOptions: string,
  ) {}

  private async importTestElectron() {
    const electronPath = await mustResolve(this.config, '@vscode/test-electron');
    const electron: typeof import('@vscode/test-electron') = await import(
      pathToFileURL(electronPath).toString()
    );
    return electron;
  }

  /** @inheritdoc */
  public async run(): Promise<number> {
    const electron = await this.importTestElectron();

    return await electron.runTests({
      ...this.test,
      version: this.args.codeVersion || this.test.version,
      extensionDevelopmentPath: this.extensionDevelopmentPath,
      extensionTestsPath: this.extensionTestsPath,
      extensionTestsEnv: this.env,
      launchArgs: (this.test.launchArgs || []).slice(),
      platform: this.test.desktopPlatform,
      reporter: this.test.download?.reporter,
      timeout: this.test.download?.timeout,
      reuseMachineInstall:
        this.test.useInstallation && 'fromMachine' in this.test.useInstallation
          ? this.test.useInstallation.fromMachine
          : undefined,
      vscodeExecutablePath:
        this.test.useInstallation && 'fromPath' in this.test.useInstallation
          ? this.test.useInstallation.fromPath
          : undefined,
    });
  }

  /** @inheritdoc */
  public dumpJson(): object {
    return {
      path: this.config.path,
      config: this.test,
      extensionTestsPath: this.extensionTestsPath,
      extensionDevelopmentPath: this.extensionDevelopmentPath,
      env: this.env,
    };
  }
}
