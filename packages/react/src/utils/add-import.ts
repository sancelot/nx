import { ChangeType, StringChange } from '@nrwl/devkit';
import { findNodes } from 'nx/src/utils/typescript';
import type * as ts from 'typescript';

let tsModule: typeof import('typescript');

export function addImport(
  source: ts.SourceFile,
  statement: string
): StringChange[] {
  if (!tsModule) {
    tsModule = require('typescript');
  }
  const allImports = findNodes(source, tsModule.SyntaxKind.ImportDeclaration);
  if (allImports.length > 0) {
    const lastImport = allImports[allImports.length - 1];
    return [
      {
        type: ChangeType.Insert,
        index: lastImport.end + 1,
        text: `\n${statement}\n`,
      },
    ];
  } else {
    return [
      {
        type: ChangeType.Insert,
        index: 0,
        text: `\n${statement}\n`,
      },
    ];
  }
}
