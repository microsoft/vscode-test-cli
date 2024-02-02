import electron, { ProgressReporter } from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
export async function installExtensions(
  extensionDevelopmentPath: string | string[],
  extensions: string[] = [],
  skipExtensionDependencies: boolean = false,
  codeVersion?: string,
  desktopPlatform?: string,
  reporter?: ProgressReporter,
) {
  const vscodePath = await electron.downloadAndUnzipVSCode(codeVersion, desktopPlatform, reporter);

  const extensionDevelopmentPaths = Array.isArray(extensionDevelopmentPath)
    ? extensionDevelopmentPath
    : [extensionDevelopmentPath];

  const extensionsToInstall = skipExtensionDependencies
    ? extensions
    : mergeDependentExtensions(extensions, extensionDevelopmentPaths);

  const [cli, ...cliArgs] = electron.resolveCliArgsFromVSCodeExecutablePath(vscodePath, {
    platform: desktopPlatform,
  });

  if (extensionsToInstall.length === 0) {
    console.debug('No extensions to install');
    return;
  }

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
  const extensionsToInstall = extensions.flat();
  // TODO: Edge case: we have same extension dependency in multiple development paths, choose lowest version?
  for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
    const packageJsonPath = path.join(extensionDevelopmentPath, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!packageJson.hasOwnProperty('extensionDependencies')) {
      console.debug(`No extensionDependencies found in ${packageJsonPath}`);
      continue;
    }
    const dependencies = packageJson.extensionDependencies;
    if (!dependencies || !Array.isArray(dependencies)) {
      throw new Error(
        `extensionDependencies in ${extensionDevelopmentPath} must be an array of strings`,
      );
    }

    /** Effectively strips the version specification from the extension name */
    const getExtensionName = (name: string) => name.split('@')[0];

    for (const dependency of dependencies) {
      const extensionNames = extensionsToInstall.map(getExtensionName);
      const dependencyName = getExtensionName(dependency);
      if (!extensionNames.includes(dependencyName)) {
        console.debug(`Adding dependent extension ${dependency} from ${extensionDevelopmentPath}`);
        extensionsToInstall.push(dependency);
      }
    }
  }

  return extensionsToInstall;
}
