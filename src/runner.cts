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
  ].map((f) => require(f));

  // currently `require` only seems to take effect for parallel runs, but remove
  // the option in case it's supported for serial runs in the future since we're
  // handling it ourselves.
  delete mochaOpts.require;

  for (const { mochaGlobalSetup } of required) {
    await mochaGlobalSetup?.();
  }

  for (const file of files) {
    mocha.addFile(file);
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

const ensureArray = <T,>(value: T | T[] | undefined): T[] =>
  value ? (Array.isArray(value) ? value : [value]) : [];
