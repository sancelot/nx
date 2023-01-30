import {
  addDependenciesToPackageJson,
  formatFiles,
  installPackagesTask,
  moveFilesToNewDirectory,
  removeDependenciesFromPackageJson,
  Tree,
} from '@nrwl/devkit';
import { wrapAngularDevkitSchematic } from '@nrwl/devkit/ngcli-adapter';
import { jestProjectGenerator } from '@nrwl/jest/generators';
import { Linter } from '@nrwl/linter';
import { lt } from 'semver';
import init from '../../generators/init/init';
import { E2eTestRunner } from '../../utils/test-runners';
import { getPkgVersionForAngularMajorVersion } from '../../utils/version-utils';
import addLintingGenerator from '../add-linting/add-linting';
import karmaProjectGenerator from '../karma-project/karma-project';
import setupTailwindGenerator from '../setup-tailwind/setup-tailwind';
import { getInstalledAngularVersionInfo } from '../utils/version-utils';
import { addBuildableLibrariesPostCssDependencies } from '../utils/dependencies';
import { addModule } from './lib/add-module';
import { addStandaloneComponent } from './lib/add-standalone-component';
import {
  enableStrictTypeChecking,
  setLibraryStrictDefault,
} from './lib/enable-strict-type-checking';
import { normalizeOptions } from './lib/normalize-options';
import { NormalizedSchema } from './lib/normalized-schema';
import { updateLibPackageNpmScope } from './lib/update-lib-package-npm-scope';
import { updateProject } from './lib/update-project';
import { updateTsConfig } from './lib/update-tsconfig';
import { Schema } from './schema';

export async function libraryGenerator(tree: Tree, schema: Schema) {
  // Do some validation checks
  if (!schema.routing && schema.lazy) {
    throw new Error(`To use "--lazy" option, "--routing" must also be set.`);
  }

  if (schema.publishable === true && !schema.importPath) {
    throw new Error(
      `For publishable libs you have to provide a proper "--importPath" which needs to be a valid npm package name (e.g. my-awesome-lib or @myorg/my-lib)`
    );
  }

  if (schema.addTailwind && !schema.buildable && !schema.publishable) {
    throw new Error(
      `To use "--addTailwind" option, you have to set either "--buildable" or "--publishable".`
    );
  }

  const userInstalledAngularVersion = getInstalledAngularVersionInfo(tree);
  if (lt(userInstalledAngularVersion.version, '14.1.0') && schema.standalone) {
    throw new Error(
      `The "--standalone" option is not supported in Angular versions < 14.1.0.`
    );
  }

  const options = normalizeOptions(tree, schema);
  const { libraryOptions, componentOptions } = options;

  await init(tree, {
    ...libraryOptions,
    skipFormat: true,
    e2eTestRunner: E2eTestRunner.None,
  });

  const runAngularLibrarySchematic = wrapAngularDevkitSchematic(
    '@schematics/angular',
    'library'
  );
  await runAngularLibrarySchematic(tree, {
    name: libraryOptions.name,
    prefix: libraryOptions.prefix,
    entryFile: 'index',
    skipPackageJson:
      libraryOptions.skipPackageJson ||
      !(libraryOptions.publishable || libraryOptions.buildable),
    skipTsConfig: true,
  });

  if (libraryOptions.ngCliSchematicLibRoot !== libraryOptions.projectRoot) {
    moveFilesToNewDirectory(
      tree,
      libraryOptions.ngCliSchematicLibRoot,
      libraryOptions.projectRoot
    );
  }
  await updateProject(tree, libraryOptions);
  await addUnitTestRunner(tree, libraryOptions);
  updateNpmScopeIfBuildableOrPublishable(tree, libraryOptions);

  if (!libraryOptions.standalone) {
    addModule(tree, libraryOptions);
  } else {
    await addStandaloneComponent(tree, options);
  }

  setStrictMode(tree, libraryOptions);
  await addLinting(tree, libraryOptions);

  if (libraryOptions.addTailwind) {
    await setupTailwindGenerator(tree, {
      project: libraryOptions.name,
      skipFormat: true,
    });
  }

  if (libraryOptions.buildable || libraryOptions.publishable) {
    removeDependenciesFromPackageJson(tree, [], ['ng-packagr']);
    addDependenciesToPackageJson(
      tree,
      {},
      {
        'ng-packagr': getPkgVersionForAngularMajorVersion(
          'ngPackagrVersion',
          userInstalledAngularVersion.major
        ),
      }
    );
    addBuildableLibrariesPostCssDependencies(tree);
  }
  updateTsConfig(tree, libraryOptions);

  if (!libraryOptions.skipFormat) {
    await formatFiles(tree);
  }

  return () => {
    installPackagesTask(tree);
  };
}

async function addUnitTestRunner(
  host: Tree,
  options: NormalizedSchema['libraryOptions']
) {
  if (options.unitTestRunner === 'jest') {
    await jestProjectGenerator(host, {
      project: options.name,
      setupFile: 'angular',
      supportTsx: false,
      skipSerializers: false,
      skipFormat: true,
      skipPackageJson: options.skipPackageJson,
    });
  } else if (options.unitTestRunner === 'karma') {
    await karmaProjectGenerator(host, {
      project: options.name,
      skipFormat: true,
    });
  }
}

function updateNpmScopeIfBuildableOrPublishable(
  host: Tree,
  options: NormalizedSchema['libraryOptions']
) {
  if (options.buildable || options.publishable) {
    updateLibPackageNpmScope(host, options);
  }
}

function setStrictMode(
  host: Tree,
  options: NormalizedSchema['libraryOptions']
) {
  if (options.strict) {
    enableStrictTypeChecking(host, options);
  } else {
    setLibraryStrictDefault(host, options.strict);
  }
}

async function addLinting(
  host: Tree,
  options: NormalizedSchema['libraryOptions']
) {
  if (options.linter === Linter.None) {
    return;
  }
  await addLintingGenerator(host, {
    projectName: options.name,
    projectRoot: options.projectRoot,
    prefix: options.prefix,
    unitTestRunner: options.unitTestRunner,
    setParserOptionsProject: options.setParserOptionsProject,
    skipFormat: true,
    skipPackageJson: options.skipPackageJson,
  });
}

export default libraryGenerator;
