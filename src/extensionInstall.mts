import electron, { ProgressReporter } from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
    ? extensionDevelopmentPaths.flatMap((p) => mergeDependentExtensions(extensions, p))
    : extensions;

  const [cli, ...cliArgs] = electron.resolveCliArgsFromVSCodeExecutablePath(vscodePath);

  for (const extension of extensionsToInstall) {
    cliArgs.push('--install-extension', extension);
  }

  const installResult = spawnSync(cli, cliArgs, {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (installResult.status !== 0) {
    console.error(installResult.stderr);
    throw new Error(`Failed to install extension: ${installResult.stderr}`);
  }
  // TODO: Stream via reporter
  return installResult.stdout;
}

// Merge in the dependent extensions from the package.json file only if the base name prior to the @ symbol is not already specified in extensions
function mergeDependentExtensions(extensions: string[], extensionDevelopmentPath: string) {
  const packageJsonPath = path.join(extensionDevelopmentPath, 'package.json');
  const dependencies: string[] = require(packageJsonPath).extensionDependencies;

  if (!Array.isArray(dependencies)) {
    throw new Error('extensionDependencies in package.json must be an array of strings');
  }

  const extensionsToInstall = new Set(extensions);
  const extensionNames = extensions.map((extension) => extension.split('@')[0]);
  for (const dependency of dependencies) {
    const dependencyName = dependency.split('@')[0];
    if (!extensionNames.includes(dependencyName)) {
      extensionsToInstall.add(dependency);
    }
  }
  return Array.from(extensionsToInstall);
}
