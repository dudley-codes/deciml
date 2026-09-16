import ts from "typescript";

import type { ExtractedSymbol, SymbolKind } from "./types.js";

type FunctionLikeNode =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

type SourceFileWithDiagnostics = ts.SourceFile & {
  parseDiagnostics: readonly ts.DiagnosticWithLocation[];
};

const jestCallKinds = new Map<string, SymbolKind>([
  ["describe", "suite"],
  ["it", "test"],
  ["test", "test"],
  ["beforeEach", "hook"],
  ["afterEach", "hook"],
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function functionSignature(
  name: string,
  node: FunctionLikeNode,
  sourceFile: ts.SourceFile,
): string {
  const isAsync = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
  );
  const typeParameters = node.typeParameters?.length
    ? `<${node.typeParameters.map((parameter) => parameter.getText(sourceFile)).join(", ")}>`
    : "";
  const parameters = node.parameters
    .map((parameter) => parameter.getText(sourceFile))
    .join(", ");
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";

  return normalizeWhitespace(
    `${isAsync ? "async " : ""}${name}${typeParameters}(${parameters})${returnType}`,
  );
}

function callRootName(expression: ts.Expression): string | undefined {
  let current = expression;

  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    current = current.expression;
  }

  return ts.isIdentifier(current) ? current.text : undefined;
}

function functionInitializer(
  initializer: ts.Expression | undefined,
): ts.FunctionExpression | ts.ArrowFunction | undefined {
  if (!initializer) return undefined;
  if (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)) {
    return initializer;
  }

  if (
    ts.isCallExpression(initializer) &&
    callRootName(initializer.expression) === "useCallback"
  ) {
    return initializer.arguments.find(
      (argument): argument is ts.FunctionExpression | ts.ArrowFunction =>
        ts.isFunctionExpression(argument) || ts.isArrowFunction(argument),
    );
  }

  return undefined;
}

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function extractSymbols(path: string, sourceText: string): ExtractedSymbol[] {
  const sourceFile = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path),
  );
  const diagnostics = (sourceFile as SourceFileWithDiagnostics).parseDiagnostics;

  if (diagnostics.length > 0) {
    const messages = diagnostics.map((diagnostic) => {
      const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      return `${path}:${location.line + 1}:${location.character + 1}: ${message}`;
    });
    throw new Error(`TypeScript parse failed:\n${messages.join("\n")}`);
  }

  const symbols: ExtractedSymbol[] = [];

  const addSymbol = (
    node: ts.Node,
    name: string,
    kind: SymbolKind,
    signature?: string,
  ): void => {
    const startOffset = node.getStart(sourceFile);
    const endOffset = node.getEnd();
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const inclusiveEnd = sourceFile.getLineAndCharacterOfPosition(
      Math.max(startOffset, endOffset - 1),
    );

    symbols.push({
      name,
      kind,
      startLine: start.line + 1,
      endLine: inclusiveEnd.line + 1,
      startOffset,
      endOffset,
      ...(signature ? { signature } : {}),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addSymbol(
        node,
        node.name.text,
        "function",
        functionSignature(node.name.text, node, sourceFile),
      );
    } else if (ts.isMethodDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      addSymbol(node, name, "method", functionSignature(name, node, sourceFile));
    } else if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node, node.name.text, "type");
    } else if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node, node.name.text, "interface");
    } else if (ts.isEnumDeclaration(node)) {
      addSymbol(node, node.name.text, "enum");
    } else if (ts.isClassDeclaration(node) && node.name) {
      addSymbol(node, node.name.text, "class");
    } else if (ts.isVariableStatement(node)) {
      const isTopLevel = node.parent === sourceFile;

      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;

        const initializer = functionInitializer(declaration.initializer);
        if (!isTopLevel && !initializer) continue;

        addSymbol(
          declaration,
          declaration.name.text,
          initializer ? "function" : "variable",
          initializer
            ? functionSignature(declaration.name.text, initializer, sourceFile)
            : undefined,
        );
      }
    } else if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression)
    ) {
      const call = node.expression;
      const rootName = callRootName(call.expression);
      const kind = rootName ? jestCallKinds.get(rootName) : undefined;
      const hasCallback = call.arguments.some(
        (argument) =>
          ts.isFunctionExpression(argument) || ts.isArrowFunction(argument),
      );

      if (rootName && kind && hasCallback) {
        const title = call.arguments.find(ts.isStringLiteralLike)?.text;
        const name = title ?? rootName;
        addSymbol(node, name, kind, `${rootName}(${JSON.stringify(name)})`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return symbols.sort(
    (left, right) =>
      left.startOffset - right.startOffset ||
      left.endOffset - right.endOffset ||
      compareText(left.kind, right.kind) ||
      compareText(left.name, right.name),
  );
}
