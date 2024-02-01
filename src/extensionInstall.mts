import electron, { ProgressReporter } from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export async function installExtensions(
  extensionDevelopmentPath: string | string[],
  extensions: string[] = [],
  installDependentExtensions: boolean = false,
  codeVersion?: string,
  desktopPlatform?: string,
  reporter?: ProgressReporter,
) {
  const vscodePath = await electron.downloadAndUnzipVSCode(codeVersion, desktopPlatform, reporter);

  const extensionDevelopmentPaths = Array.isArray(extensionDevelopmentPath)
    ? extensionDevelopmentPath
    : [extensionDevelopmentPath];

  const extensionsToInstall = installDependentExtensions
    ? mergeDependentExtensions(extensions, extensionDevelopmentPaths)
    : extensions;

  const [cli, ...cliArgs] = electron.resolveCliArgsFromVSCodeExecutablePath(vscodePath, {
    platform: desktopPlatform,
  });

  for (const extension of extensionsToInstall) {
    cliArgs.push('--install-extension', extension);
  }

  console.debug('Installing VSCode Extensions', cli, cliArgs);

  // TODO: Start async and stream the results
  const installResult = spawnSync(cli, cliArgs, { encoding: 'utf-8' });
  if (installResult.stderr) {
    throw new Error(`Error installing extensions: ${installResult.stderr}`);
  }
  return installResult.stdout;
}

// Merge in the dependent extensions from the package.json file only if the base name prior to the @ symbol is not already specified in extensions
function mergeDependentExtensions(extensions: string[], extensionDevelopmentPaths: string[]) {
  const extensionsToInstall = new Set(extensions);
  // TODO: Edge case: we have same extension dependency in multiple development paths, choose lowest version?
  for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
    const packageJsonPath = path.join(extensionDevelopmentPath, 'package.json');
    const packageJson = require(packageJsonPath);
    const dependencies = packageJson.extensionDependencies;
    if (!Array.isArray(dependencies)) {
      throw new Error(
        `extensionDependencies in ${extensionDevelopmentPath} must be an array of strings`,
      );
    }

    for (const dependency of dependencies) {
      const extensionNames = Array.from(extensionsToInstall).map(
        (extension) => extension.split('@')[0],
      );
      const dependencyName = dependency.split('@')[0];
      if (!extensionNames.includes(dependencyName)) {
        console.debug(`Adding dependent extension ${dependency} from ${extensionDevelopmentPath}`);
        extensionsToInstall.add(dependency);
      }
    }
  }

  return Array.from(extensionsToInstall);
}
