/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as Mocha from 'mocha';
import { inspect } from 'util';
import { MochaEvent, MochaEventTuple } from './fullJsonStreamReporterTypes.cjs';

export * from './fullJsonStreamReporterTypes.cjs';

/**
 * Similar to the mocha JSON stream, but includes additional information
 * on failure and when tests run. Specifically, the mocha json-stream does not
 * include unmangled expected versus actual results.
 *
 * Writes a superset of the data that json-stream normally would.
 */
module.exports = class FullJsonStreamReporter {
  constructor(runner: Mocha.Runner) {
    const total = runner.total;
    runner.once(Mocha.Runner.constants.EVENT_RUN_BEGIN, () =>
      writeEvent([MochaEvent.Start, { total }]),
    );
    runner.once(Mocha.Runner.constants.EVENT_RUN_END, () => writeEvent([MochaEvent.End, {}]));

    runner.on(Mocha.Runner.constants.EVENT_SUITE_BEGIN, (suite: Mocha.Suite) =>
      writeEvent([MochaEvent.SuiteStart, { path: suite.titlePath(), file: suite.file }]),
    );
    runner.on(Mocha.Runner.constants.EVENT_TEST_BEGIN, (test: Mocha.Test) =>
      writeEvent([MochaEvent.TestStart, clean(test)]),
    );
    runner.on(Mocha.Runner.constants.EVENT_TEST_PASS, (test) =>
      writeEvent([MochaEvent.Pass, clean(test)]),
    );
    runner.on(Mocha.Runner.constants.EVENT_TEST_FAIL, (test, err) => {
      writeEvent([
        MochaEvent.Fail,
        {
          ...clean(test),
          actual: inspect(err.actual, { depth: 30 }),
          expected: inspect(err.expected, { depth: 30 }),
          err: err.message,
          stack: err.stack || null,
        },
      ]);
    });
  }
};

function writeEvent(event: MochaEventTuple) {
  process.stdout.write(JSON.stringify(event) + '\n');
}

const clean = (test: Mocha.Test) => {
  return {
    path: test.titlePath(),
    duration: test.duration,
    currentRetry: (test as any).currentRetry(),
    file: test.file,
    speed:
      !test.duration || test.duration < test.slow() / 2
        ? ('fast' as const)
        : test.duration > test.slow()
          ? ('slow' as const)
          : ('medium' as const),
  };
};
