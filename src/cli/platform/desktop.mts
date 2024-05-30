/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import type * as Electron from '@vscode/test-electron';
import { spawn } from 'child_process';
import { join, resolve as resolvePath } from 'path';
import supportsColor from 'supports-color';
import { fileURLToPath, pathToFileURL } from 'url';
import { IDesktopTestConfiguration } from '../../config.cjs';
import { CliArgs } from '../args.mjs';
import { ResolvedTestConfiguration } from '../config.mjs';
import { CliExpectedError } from '../error.mjs';
import { gatherFiles } from '../gatherFiles.mjs';
import { mustResolve } from '../resolver.mjs';
import { ensureArray, readJSON } from '../util.mjs';
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
    const electron: typeof Electron = await import(pathToFileURL(electronPath).toString());
    return electron;
  }

  /** @inheritdoc */
  public async run({ coverage }: IRunContext): Promise<number> {
    // note: we do this here rather than in prepare() so that UI integration can
    // work and show tests even if @vscode/test-electron isn't installed yet.
    const electron = await this.importTestElectron();
    await this.installDependentExtensions(electron);

    const env = this.env;
    env.NODE_V8_COVERAGE = coverage;

    try {
      return await electron.runTests({
        ...this.baseCliOptions(),
        extensionDevelopmentPath: this.extensionDevelopmentPath,
        extensionTestsPath: this.extensionTestsPath,
        extensionTestsEnv: env,
      });
    } catch (e) {
      // test-electron nominally returns an exit code, but actually rejects the
      // promise if the test fails. Old versions throw a string, new versions
      // throw a well-typed error.
      if (
        typeof e === 'string' ||
        (electron.TestRunFailedError && e instanceof electron.TestRunFailedError)
      ) {
        return 1;
      }

      throw e;
    }
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

  private baseCliOptions() {
    return {
      ...this.test,
      version: this.args.codeVersion || this.test.version,
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
    };
  }

  private async installDependentExtensions(electron: typeof Electron) {
    const exts = new ExtensionMerger();
    if (!this.args.skipExtensionDependencies && !this.test.skipExtensionDependencies) {
      await addDependentExtensions(exts, this.extensionDevelopmentPath);
    }
    exts.push(this.test.installExtensions);
    exts.push(this.args.installExtensions as string[] | undefined);

    if (!exts.size) {
      return;
    }

    const opts = this.baseCliOptions();
    const vscodePath = await electron.downloadAndUnzipVSCode(
      opts.version,
      opts.platform,
      opts.reporter,
    );

    const [cli, ...cliArgs] = electron.resolveCliArgsFromVSCodeExecutablePath(vscodePath, opts);
    for (const extension of exts.value) {
      cliArgs.push('--install-extension', extension);
    }

    // todo@connor4312: have a nicer reporter here
    return new Promise<void>((resolve, reject) => {
      const installer = spawn(cli, cliArgs, { stdio: 'pipe' });
      let output: string = '';
      installer.stdout.setEncoding('utf-8').on('data', (data) => {
        output += data;
      });
      installer.stderr.setEncoding('utf-8').on('data', (data) => {
        output += data;
      });
      installer.on('close', (e) => {
        if (e !== 0) {
          reject(new CliExpectedError(`Failed to install extensions (${exts}): ${output}`));
        } else {
          resolve();
        }
      });
    });
  }
}

class ExtensionMerger {
  private readonly _value = new Map<string, string | undefined>();

  public get value() {
    return [...this._value].map(([k, v]) => (v ? `${k}@${v}` : k));
  }

  public get size() {
    return this._value.size;
  }

  public push(exts: string[] | undefined = []) {
    for (const extension of exts) {
      // TODO: Edge case: we have same extension dependency in multiple development paths, choose lowest version?
      const [name, version] = extension.split('@');
      this._value.set(name, version);
    }
  }

  public toString() {
    return this.value.join(', ');
  }
}

async function addDependentExtensions(
  merger: ExtensionMerger,
  extensionDevelopmentPaths: string[],
) {
  for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
    const packageJsonPath = join(extensionDevelopmentPath, 'package.json');
    const packageJson = await readJSON<{ extensionDependencies?: string[] }>(packageJsonPath);
    if (!packageJson?.extensionDependencies?.length) {
      continue;
    }

    // todo@connor4212: we have same extension dependency in multiple development paths, choose highest constraint?
    merger.push(packageJson.extensionDependencies);
  }
}
