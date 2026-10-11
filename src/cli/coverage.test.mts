/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Coverage } from './coverage.mjs';
import { ResolvedTestConfiguration } from './config.mjs';
import { CliArgs } from './args.mjs';

for (const scenario of ['absolute', 'relative', 'cli override', 'default'] as const) {
  test(`coverage report output: ${scenario}`, async () => {
    const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'test-cli coverage ')));
    let coverage: Coverage | undefined;
    try {
      const fixture = join(dir, 'fixture.cjs');
      await fs.writeFile(fixture, 'function add(a, b) { return a + b; } add(1, 2);');
      const output = scenario === 'absolute' ? join(dir, 'custom report') : 'custom report';
      const config = await ResolvedTestConfiguration.load(
        {
          tests: [{ files: [], extensionDevelopmentPath: dir }],
          coverage: {
            reporter: ['json'],
            ...(scenario === 'default' ? {} : { output }),
          },
        },
        join(dir, '.vscode-test.mjs'),
      );
      const args = (
        scenario === 'cli override' ? { coverageOutput: join(dir, 'cli report') } : {}
      ) as CliArgs;
      coverage = new Coverage(config, args);
      execFileSync(process.execPath, [fixture], {
        env: { ...process.env, NODE_V8_COVERAGE: coverage.targetDir },
      });
      await coverage.write();
      const expectedDir = join(
        dir,
        scenario === 'default'
          ? 'coverage'
          : scenario === 'cli override'
            ? 'cli report'
            : 'custom report',
      );
      const report: Record<string, { s: Record<string, number> }> = JSON.parse(
        await fs.readFile(join(expectedDir, 'coverage-final.json'), 'utf8'),
      );
      assert.ok(Object.keys(report).some((file) => resolve(file) === resolve(fixture)));
      assert.ok(
        Object.values(report).some((file) =>
          Object.values(file.s).some((count) => Number(count) > 0),
        ),
      );
      for (const otherDir of ['coverage', 'custom report', 'cli report']) {
        if (join(dir, otherDir) !== expectedDir) {
          await assert.rejects(fs.access(join(dir, otherDir, 'coverage-final.json')), {
            code: 'ENOENT',
          });
        }
      }
      await assert.rejects(fs.access(coverage.targetDir), { code: 'ENOENT' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      if (coverage) {
        await fs.rm(coverage.targetDir, { recursive: true, force: true });
      }
    }
  });
}
