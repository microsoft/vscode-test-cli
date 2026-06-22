import resolveCb from 'enhanced-resolve';
import { CliExpectedError } from './error.mjs';

export const commonJsResolve = (context: string, moduleName: string): Promise<string | false> =>
  new Promise((resolve, reject) => {
    resolveCb(context, moduleName, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res ?? false);
      }
    });
  });

/**
 * Resolves the module in context of the configuration.
 *
 * Only does traditional Node resolution without looking at the `exports` field
 * or alternative extensions (cjs/mjs) to match what the VS Code loader does.
 */
export const mustResolve = async (context: string, moduleName: string) => {
  const path = await commonJsResolve(context, moduleName);
  if (!path) {
    let msg = `Could not resolve module "${moduleName}" in ${path}`;
    if (!moduleName.startsWith('.')) {
      msg += ' (you may need to install with `npm install`)';
    }

    throw new CliExpectedError(msg);
  }

  return path;
};
