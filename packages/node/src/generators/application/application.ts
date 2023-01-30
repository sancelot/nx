import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  convertNxGenerator,
  extractLayoutDirectory,
  formatFiles,
  generateFiles,
  GeneratorCallback,
  getWorkspaceLayout,
  joinPathFragments,
  logger,
  names,
  offsetFromRoot,
  ProjectConfiguration,
  readProjectConfiguration,
  TargetConfiguration,
  toJS,
  Tree,
  updateJson,
  updateProjectConfiguration,
  updateTsConfigsToJs,
} from '@nrwl/devkit';
import { Linter, lintProjectGenerator } from '@nrwl/linter';
import { jestProjectGenerator } from '@nrwl/jest/generators';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import { getRelativePathToRootTsConfig } from '@nrwl/js';
import * as shared from '@nrwl/workspace/src/utils/create-ts-config';
import { join } from 'path';

import { initGenerator } from '../init/init';
import {
  esbuildVersion,
  expressTypingsVersion,
  expressVersion,
  fastifyVersion,
  koaTypingsVersion,
  koaVersion,
  nxVersion,
} from '../../utils/versions';
import { e2eProjectGenerator } from '../e2e-project/e2e-project';
import { setupDockerGenerator } from '../setup-docker/setup-docker';

import { Schema } from './schema';

export interface NormalizedSchema extends Schema {
  appProjectRoot: string;
  parsedTags: string[];
}

function getWebpackBuildConfig(
  project: ProjectConfiguration,
  options: NormalizedSchema
): TargetConfiguration {
  return {
    executor: `@nrwl/webpack:webpack`,
    outputs: ['{options.outputPath}'],
    options: {
      target: 'node',
      compiler: 'tsc',
      outputPath: joinPathFragments(
        'dist',
        options.rootProject ? options.name : options.appProjectRoot
      ),
      main: joinPathFragments(
        project.sourceRoot,
        'main' + (options.js ? '.js' : '.ts')
      ),
      tsConfig: joinPathFragments(options.appProjectRoot, 'tsconfig.app.json'),
      assets: [joinPathFragments(project.sourceRoot, 'assets')],
      isolatedConfig: true,
      webpackConfig: joinPathFragments(
        options.appProjectRoot,
        'webpack.config.js'
      ),
    },
    configurations: {
      production: {
        optimization: true,
        extractLicenses: true,
        inspect: false,
      },
    },
  };
}

function getEsBuildConfig(
  project: ProjectConfiguration,
  options: NormalizedSchema
): TargetConfiguration {
  return {
    executor: '@nrwl/esbuild:esbuild',
    outputs: ['{options.outputPath}'],
    options: {
      outputPath: joinPathFragments(
        'dist',
        options.rootProject ? options.name : options.appProjectRoot
      ),
      format: ['cjs'],
      main: joinPathFragments(
        project.sourceRoot,
        'main' + (options.js ? '.js' : '.ts')
      ),
      tsConfig: joinPathFragments(options.appProjectRoot, 'tsconfig.app.json'),
      assets: [joinPathFragments(project.sourceRoot, 'assets')],
    },
  };
}

function getServeConfig(options: NormalizedSchema): TargetConfiguration {
  return {
    executor: '@nrwl/js:node',
    options: {
      buildTarget: `${options.name}:build`,
    },
    configurations: {
      production: {
        buildTarget: `${options.name}:build:production`,
      },
    },
  };
}

function addProject(tree: Tree, options: NormalizedSchema) {
  const project: ProjectConfiguration = {
    root: options.appProjectRoot,
    sourceRoot: joinPathFragments(options.appProjectRoot, 'src'),
    projectType: 'application',
    targets: {},
    tags: options.parsedTags,
  };

  project.targets.build =
    options.bundler === 'esbuild'
      ? getEsBuildConfig(project, options)
      : getWebpackBuildConfig(project, options);
  project.targets.serve = getServeConfig(options);

  addProjectConfiguration(
    tree,
    options.name,
    project,
    options.standaloneConfig
  );
}

function addAppFiles(tree: Tree, options: NormalizedSchema) {
  generateFiles(
    tree,
    join(__dirname, './files/common'),
    options.appProjectRoot,
    {
      ...options,
      tmpl: '',
      name: options.name,
      root: options.appProjectRoot,
      offset: offsetFromRoot(options.appProjectRoot),
      rootTsConfigPath: getRelativePathToRootTsConfig(
        tree,
        options.appProjectRoot
      ),
    }
  );

  if (options.bundler !== 'webpack') {
    tree.delete(joinPathFragments(options.appProjectRoot, 'webpack.config.js'));
  }

  if (options.framework && options.framework !== 'none') {
    generateFiles(
      tree,
      join(__dirname, `./files/${options.framework}`),
      options.appProjectRoot,
      {
        ...options,
        tmpl: '',
        name: options.name,
        root: options.appProjectRoot,
        offset: offsetFromRoot(options.appProjectRoot),
        rootTsConfigPath: getRelativePathToRootTsConfig(
          tree,
          options.appProjectRoot
        ),
      }
    );
  }
  if (options.js) {
    toJS(tree);
  }
  if (options.pascalCaseFiles) {
    logger.warn('NOTE: --pascalCaseFiles is a noop');
  }
}

function addProxy(tree: Tree, options: NormalizedSchema) {
  const projectConfig = readProjectConfiguration(tree, options.frontendProject);
  if (projectConfig.targets && projectConfig.targets.serve) {
    const pathToProxyFile = `${projectConfig.root}/proxy.conf.json`;
    projectConfig.targets.serve.options = {
      ...projectConfig.targets.serve.options,
      proxyConfig: pathToProxyFile,
    };

    if (!tree.exists(pathToProxyFile)) {
      tree.write(
        pathToProxyFile,
        JSON.stringify(
          {
            '/api': {
              target: 'http://localhost:3333',
              secure: false,
            },
          },
          null,
          2
        )
      );
    } else {
      //add new entry to existing config
      const proxyFileContent = tree.read(pathToProxyFile).toString();

      const proxyModified = {
        ...JSON.parse(proxyFileContent),
        [`/${options.name}-api`]: {
          target: 'http://localhost:3333',
          secure: false,
        },
      };

      tree.write(pathToProxyFile, JSON.stringify(proxyModified, null, 2));
    }

    updateProjectConfiguration(tree, options.frontendProject, projectConfig);
  }
}

export async function addLintingToApplication(
  tree: Tree,
  options: NormalizedSchema
): Promise<GeneratorCallback> {
  const lintTask = await lintProjectGenerator(tree, {
    linter: options.linter,
    project: options.name,
    tsConfigPaths: [
      joinPathFragments(options.appProjectRoot, 'tsconfig.app.json'),
    ],
    eslintFilePatterns: [
      `${options.appProjectRoot}/**/*.${options.js ? 'js' : 'ts'}`,
    ],
    unitTestRunner: options.unitTestRunner,
    skipFormat: true,
    setParserOptionsProject: options.setParserOptionsProject,
  });

  return lintTask;
}

function addProjectDependencies(
  tree: Tree,
  options: NormalizedSchema
): GeneratorCallback {
  const bundlers = {
    webpack: {
      '@nrwl/webpack': nxVersion,
    },
    esbuild: {
      '@nrwl/esbuild': nxVersion,
      esbuild: esbuildVersion,
    },
  };

  const frameworkDependencies = {
    express: {
      express: expressVersion,
      '@types/express': expressTypingsVersion,
    },
    koa: {
      koa: koaVersion,
      '@types/koa': koaTypingsVersion,
    },
    fastify: {
      fastify: fastifyVersion,
    },
  };
  return addDependenciesToPackageJson(
    tree,
    {},
    {
      ...frameworkDependencies[options.framework],
      ...bundlers[options.bundler],
    }
  );
}

function updateTsConfigOptions(tree: Tree, options: NormalizedSchema) {
  updateJson(tree, `${options.appProjectRoot}/tsconfig.json`, (json) => {
    if (options.rootProject) {
      return {
        compilerOptions: {
          ...shared.tsConfigBaseOptions,
          ...json.compilerOptions,
          esModuleInterop: true,
        },
        ...json,
        extends: undefined,
        exclude: ['node_modules', 'tmp'],
      };
    } else {
      return {
        ...json,
        compilerOptions: {
          ...json.compilerOptions,
          esModuleInterop: true,
        },
      };
    }
  });
}

export async function applicationGenerator(tree: Tree, schema: Schema) {
  const options = normalizeOptions(tree, schema);
  const tasks: GeneratorCallback[] = [];

  const initTask = await initGenerator(tree, {
    ...options,
    skipFormat: true,
  });
  tasks.push(initTask);

  const installTask = addProjectDependencies(tree, options);
  tasks.push(installTask);
  addAppFiles(tree, options);
  addProject(tree, options);

  updateTsConfigOptions(tree, options);

  if (options.linter !== Linter.None) {
    const lintTask = await addLintingToApplication(tree, {
      ...options,
      skipFormat: true,
    });
    tasks.push(lintTask);
  }

  if (options.unitTestRunner === 'jest') {
    const jestTask = await jestProjectGenerator(tree, {
      ...options,
      project: options.name,
      setupFile: 'none',
      skipSerializers: true,
      supportTsx: options.js,
      testEnvironment: 'node',
      compiler: 'tsc',
      skipFormat: true,
    });
    tasks.push(jestTask);
  }

  if (options.e2eTestRunner === 'jest') {
    const e2eTask = await e2eProjectGenerator(tree, {
      ...options,
      projectType: options.framework === 'none' ? 'cli' : 'server',
      name: options.rootProject ? 'e2e' : `${options.name}-e2e`,
      project: options.name,
      port: options.port,
    });
    tasks.push(e2eTask);
  }

  if (options.js) {
    updateTsConfigsToJs(tree, { projectRoot: options.appProjectRoot });
  }

  if (options.frontendProject) {
    addProxy(tree, options);
  }

  if (options.docker) {
    const dockerTask = await setupDockerGenerator(tree, {
      ...options,
      project: options.name,
    });

    tasks.push(dockerTask);
  }

  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return runTasksInSerial(...tasks);
}

function normalizeOptions(host: Tree, options: Schema): NormalizedSchema {
  const { layoutDirectory, projectDirectory } = extractLayoutDirectory(
    options.directory
  );
  const appsDir = layoutDirectory ?? getWorkspaceLayout(host).appsDir;

  const appDirectory = projectDirectory
    ? `${names(projectDirectory).fileName}/${names(options.name).fileName}`
    : names(options.name).fileName;

  const appProjectName = appDirectory.replace(new RegExp('/', 'g'), '-');

  const appProjectRoot = options.rootProject
    ? '.'
    : joinPathFragments(appsDir, appDirectory);

  options.bundler = options.bundler ?? 'esbuild';
  options.e2eTestRunner = options.e2eTestRunner ?? 'jest';

  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    name: names(appProjectName).fileName,
    frontendProject: options.frontendProject
      ? names(options.frontendProject).fileName
      : undefined,
    appProjectRoot,
    parsedTags,
    linter: options.linter ?? Linter.EsLint,
    unitTestRunner: options.unitTestRunner ?? 'jest',
    rootProject: options.rootProject ?? false,
    port: options.port ?? 3000,
  };
}

export default applicationGenerator;
export const applicationSchematic = convertNxGenerator(applicationGenerator);
