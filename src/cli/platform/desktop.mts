/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { resolve as resolvePath } from 'path';
import supportsColor from 'supports-color';
import { fileURLToPath, pathToFileURL } from 'url';
import { IDesktopTestConfiguration } from '../../config.cjs';
import { CliArgs } from '../args.mjs';
import { ResolvedTestConfiguration } from '../config.mjs';
import { gatherFiles } from '../gatherFiles.mjs';
import { mustResolve } from '../resolver.mjs';
import { ensureArray } from '../util.mjs';
import { IPlatform, IPrepareContext, IPreparedRun, IRunContext } from './index.mjs';

export class DesktopPlatform implements IPlatform {
  /** @inheritdoc */
  public async prepare({
    args,
    config,
    test: _test,
  }: IPrepareContext): Promise<IPreparedRun | undefined> {
    if (_test.platform && _test.platform !== 'desktop') {
      return undefined;
    }

    const test = structuredClone(_test);
    test.launchArgs ||= [];
    if (test.workspaceFolder) {
      test.launchArgs.push(resolvePath(config.dir, test.workspaceFolder));
    }

    if (args.run?.length) {
      test.files = args.run.map((r) => resolvePath(process.cwd(), String(r)));
    }

    const preload = await Promise.all(
      [...ensureArray(test.mocha?.preload || []), ...ensureArray(args.file || [])].map((p) =>
        mustResolve(config.dir, String(p)),
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
    return this.config.extensionDevelopmentPath(this.test);
  }
  private get extensionTestsPath() {
    return resolvePath(fileURLToPath(new URL('.', import.meta.url)), '../../runner.cjs');
  }
  private get env(): Record<string, string | undefined> {
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
    const electronPath = await mustResolve(this.config.dir, '@vscode/test-electron');
    const electron: typeof import('@vscode/test-electron') = await import(
      pathToFileURL(electronPath).toString()
    );
    return electron;
  }

  /** @inheritdoc */
  public async run({ coverage }: IRunContext): Promise<number> {
    // note: we do this here rather than in prepare() so that UI integration can
    // work and show tests even if @vscode/test-electron isn't installed yet.
    const electron = await this.importTestElectron();
    const env = this.env;
    env.NODE_V8_COVERAGE = coverage;

    return electron.runTests({
      ...this.test,
      version: this.args.codeVersion || this.test.version,
      extensionDevelopmentPath: this.extensionDevelopmentPath,
      extensionTestsPath: this.extensionTestsPath,
      extensionTestsEnv: env,
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
