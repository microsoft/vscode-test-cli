/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import Mocha from 'mocha';

export async function run() {
  const {
    mochaOpts,
    files,
    preload,
    colorDefault,
  }: {
    mochaOpts: Mocha.MochaOptions;
    files: string[];
    preload: string[];
    colorDefault: boolean;
  } = JSON.parse(process.env.VSCODE_TEST_OPTIONS!);

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: colorDefault,
    ...mochaOpts,
  });

  const required: { mochaGlobalSetup?: () => unknown; mochaGlobalTeardown?: () => unknown }[] = [
    ...preload,
    ...ensureArray(mochaOpts.require),
  ].map((f) => require(normalizeCasing(f)));

  // currently `require` only seems to take effect for parallel runs, but remove
  // the option in case it's supported for serial runs in the future since we're
  // handling it ourselves.
  delete mochaOpts.require;

  for (const { mochaGlobalSetup } of required) {
    await mochaGlobalSetup?.();
  }

  for (const file of files) {
    mocha.addFile(normalizeCasing(file));
  }

  await new Promise<void>((resolve, reject) =>
    mocha.run((failures) =>
      failures
        ? reject(failures > 1 ? `${failures} tests failed.` : `${failures} test failed.`)
        : resolve(),
    ),
  );

  for (const { mochaGlobalTeardown } of required) {
    await mochaGlobalTeardown?.();
  }
}

const normalizeCasing = (path: string) => {
  // Normalize to lower-case drive letter to avoid path sensitivity in the loader
  // duplicating imports. VS Code normalizes to lower case drive letters in its
  // URIs, so do the same here
  // https://github.com/microsoft/vscode/blob/032c1b75447ade317715c3d2a82c2d9cd3e55dde/src/vs/base/common/uri.ts#L181-L185
  if (process.platform === 'win32' && path.match(/^[A-Z]:/)) {
    return path[0].toLowerCase() + path.slice(1);
  }

  return path;
};

const ensureArray = <T,>(value: T | T[] | undefined): T[] =>
  value ? (Array.isArray(value) ? value : [value]) : [];
