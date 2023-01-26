import {
  ChangeType,
  logger,
  StringChange,
  StringInsertion,
} from '@nrwl/devkit';
import { findNodes } from 'nx/src/utils/typescript';
import type * as ts from 'typescript';
import { addImport } from './add-import';

let tsModule: typeof import('typescript');

export function addInitialRoutes(
  sourcePath: string,
  source: ts.SourceFile
): StringChange[] {
  if (!tsModule) {
    tsModule = require('typescript');
  }
  const jsxClosingElements = findNodes(source, [
    tsModule.SyntaxKind.JsxClosingElement,
    tsModule.SyntaxKind.JsxClosingFragment,
  ]);
  const outerMostJsxClosing = jsxClosingElements[jsxClosingElements.length - 1];

  if (!outerMostJsxClosing) {
    logger.warn(
      `Could not find JSX elements in ${sourcePath}; Skipping insert routes`
    );
    return [];
  }

  const insertRoutes: StringInsertion = {
    type: ChangeType.Insert,
    index: outerMostJsxClosing.getStart(),
    text: `
    {/* START: routes */}
    {/* These routes and navigation have been generated for you */}
    {/* Feel free to move and update them to fit your needs */}
    <br/>
    <hr/>
    <br/>
    <div role="navigation">
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/page-2">Page 2</Link></li>
      </ul>
    </div>
    <Routes>
      <Route
        path="/"
        element={
          <div>This is the generated root route. <Link to="/page-2">Click here for page 2.</Link></div>
        }
      />
      <Route
        path="/page-2"
        element={
          <div><Link to="/">Click here to go back to root page.</Link></div>
        }
      />
    </Routes>
    {/* END: routes */}
    `,
  };

  return [
    ...addImport(
      source,
      `import { Route, Routes, Link } from 'react-router-dom';`
    ),
    insertRoutes,
  ];
}
