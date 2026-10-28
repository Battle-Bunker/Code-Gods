/**
 * ts-ast-bits-v1 (uniform): a TypeScript analogue of grid-lab's ast-bits-v1 (docs/open-agents.md §2),
 * built on the same principles but with NO published grammar tables or corpus, so it is uniform and
 * approximate. It is the one TypeScript summon price, behind the same inspection interface as Python.
 *
 * Code, in preorder over `ts.forEachChild` (the player's SourceFile only, never the prelude):
 * - structure: a child node in a slot whose category has alternatives (Statement, Expression, Type,
 *   BinaryOperator, Modifier, ClassMember, ObjectMember, BindingName) costs log2(|category|) uniformly;
 *   inside a NodeArray every element and the end marker cost log2(|category| + 1). Other slots are
 *   implied by their parent (like Python's product types) and cost 0. Prefix operators cost log2 6,
 *   postfix 1 bit, `let/const/var` log2 3.
 * - names: alpha-equivalent, as in ast-bits-v1. Scopes are the source file and every function-like
 *   node (block scoping is approximated by the enclosing function). A store costs log2(#slots + 1);
 *   a load costs 1 + log2(Σ over visible scopes of (#slots + 1)) for a user variable, or
 *   1 - log2(½·u(ES globals) + ½·u(API)) for an external. Slot 0 of the file is `agent`.
 *   Property names: 1 + log2|API attrs ∪ params| if listed, else 1 + the string code.
 * - literals: the same universal codes (Elias gamma for non-negative integers, the 98-symbol string
 *   code with the API string vocabulary at p = ½, the 18-symbol float code).
 * - literal moves: every call codes the flag (p = 1/8). A call of an API mutator constructor on literal
 *   arguments is evaluated by the trusted prelude constructors and returned as a wire call; the host adds
 *   log2(#available) + D(fields). Its generic coding is returned as the fallback.
 *
 * Known gaps versus Python's ast-bits-v1: no corpus weights; absent optional children are not coded
 * (forEachChild does not visit them), so this is not a strict prefix code; categories are derived from
 * node kinds rather than a per-(parent, field) grammar; block scopes are flattened to functions.
 */
import ts from "typescript";

const K = ts.SyntaxKind;
const log2 = Math.log2;
const P_EXT = 0.5, Q_MOVE = 1 / 8, P_STRVOC = 0.5;
const kinds = names => new Set(names.map(n => K[n]));
const STATEMENTS = kinds(["VariableStatement", "EmptyStatement", "Block", "ExpressionStatement", "IfStatement",
  "DoStatement", "WhileStatement", "ForStatement", "ForInStatement", "ForOfStatement", "ContinueStatement",
  "BreakStatement", "ReturnStatement", "WithStatement", "SwitchStatement", "LabeledStatement", "ThrowStatement",
  "TryStatement", "DebuggerStatement", "FunctionDeclaration", "ClassDeclaration", "InterfaceDeclaration",
  "TypeAliasDeclaration", "EnumDeclaration", "ModuleDeclaration"]);
const EXPRESSIONS = kinds(["Identifier", "NumericLiteral", "BigIntLiteral", "StringLiteral",
  "RegularExpressionLiteral", "NoSubstitutionTemplateLiteral", "TemplateExpression", "TrueKeyword", "FalseKeyword",
  "NullKeyword", "ThisKeyword", "SuperKeyword", "ArrayLiteralExpression", "ObjectLiteralExpression",
  "PropertyAccessExpression", "ElementAccessExpression", "CallExpression", "NewExpression",
  "TaggedTemplateExpression", "TypeAssertionExpression", "ParenthesizedExpression", "FunctionExpression",
  "ArrowFunction", "DeleteExpression", "TypeOfExpression", "VoidExpression", "AwaitExpression",
  "PrefixUnaryExpression", "PostfixUnaryExpression", "BinaryExpression", "ConditionalExpression", "YieldExpression",
  "SpreadElement", "ClassExpression", "OmittedExpression", "AsExpression", "NonNullExpression",
  "SatisfiesExpression", "MetaProperty"]);
const TYPES = new Set([...Array.from({ length: K.LastTypeNode - K.FirstTypeNode + 1 }, (_, i) => K.FirstTypeNode + i),
  ...kinds(["AnyKeyword", "UnknownKeyword", "NumberKeyword", "BigIntKeyword", "ObjectKeyword", "BooleanKeyword",
    "StringKeyword", "SymbolKeyword", "VoidKeyword", "UndefinedKeyword", "NeverKeyword", "ExpressionWithTypeArguments"])]);
const BINARY = new Set(Array.from({ length: K.LastBinaryOperator - K.FirstBinaryOperator + 1 }, (_, i) => K.FirstBinaryOperator + i));
const MODIFIERS = kinds(["ExportKeyword", "DeclareKeyword", "ConstKeyword", "ReadonlyKeyword", "StaticKeyword",
  "PublicKeyword", "PrivateKeyword", "ProtectedKeyword", "AbstractKeyword", "AsyncKeyword", "DefaultKeyword",
  "OverrideKeyword", "AccessorKeyword", "InKeyword", "OutKeyword"]);
const CLASS_MEMBERS = kinds(["PropertyDeclaration", "MethodDeclaration", "Constructor", "GetAccessor", "SetAccessor",
  "IndexSignature", "ClassStaticBlockDeclaration", "SemicolonClassElement"]);
const OBJECT_MEMBERS = kinds(["PropertyAssignment", "ShorthandPropertyAssignment", "SpreadAssignment",
  "MethodDeclaration", "GetAccessor", "SetAccessor"]);
const BINDING_NAMES = kinds(["Identifier", "ObjectBindingPattern", "ArrayBindingPattern"]);
const FUNCTIONS = kinds(["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration",
  "Constructor", "GetAccessor", "SetAccessor"]);
/** ES2022 standard globals: the TypeScript counterpart of Python's allowed builtins. */
export const ES_GLOBALS = ["AggregateError", "Array", "ArrayBuffer", "Atomics", "BigInt", "BigInt64Array",
  "BigUint64Array", "Boolean", "DataView", "Date", "Error", "EvalError", "FinalizationRegistry", "Float32Array",
  "Float64Array", "Function", "Infinity", "Int16Array", "Int32Array", "Int8Array", "JSON", "Map", "Math", "NaN",
  "Number", "Object", "Promise", "Proxy", "RangeError", "ReferenceError", "Reflect", "RegExp", "Set",
  "SharedArrayBuffer", "String", "Symbol", "SyntaxError", "TypeError", "URIError", "Uint16Array", "Uint32Array",
  "Uint8Array", "Uint8ClampedArray", "WeakMap", "WeakRef", "WeakSet", "decodeURI", "decodeURIComponent",
  "encodeURI", "encodeURIComponent", "globalThis", "isFinite", "isNaN", "parseFloat", "parseInt", "undefined",
  "performance"];

function gamma(n) {
  if (!(n >= 1)) throw new Error("gamma code needs n >= 1");
  return 2 * (n.toString(2).length - 1) + 1;
}
export function stringBits(s) {
  let b = gamma(s.length + 1);
  for (const ch of s) {
    const c = ch.codePointAt(0);
    b += log2(98);
    if (!((c >= 32 && c < 127) || ch === "\n" || ch === "\t")) b += gamma(c + 1);
  }
  return b;
}
const floatBits = text => gamma(text.length + 1) + text.length * log2(18);

function category(node, parent) {
  const k = node.kind;
  if (parent && ts.isBinaryExpression(parent) && node === parent.operatorToken) return BINARY;
  if (MODIFIERS.has(k) && parent?.modifiers?.includes(node)) return MODIFIERS;
  if (parent && (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.members.includes(node)) return CLASS_MEMBERS;
  if (parent && ts.isObjectLiteralExpression(parent)) return OBJECT_MEMBERS;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent))
      && node === parent.name) return BINDING_NAMES;
  if (STATEMENTS.has(k)) return STATEMENTS;
  if (TYPES.has(k) && !(parent && ts.isLiteralTypeNode(parent))) return TYPES;
  if (EXPRESSIONS.has(k)) return EXPRESSIONS;
  return null;
}

/** Identifier roles: "decl" (binds in a scope), "prop" (property name), "load". */
function role(id, parent) {
  if (!parent) return "load";
  if ((ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) && (parent.name === id || parent.right === id)) return "prop";
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
      || ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isGetAccessor(parent)
      || ts.isSetAccessor(parent) || ts.isEnumMember(parent)) && parent.name === id) return "prop";
  if (ts.isBindingElement(parent) && parent.propertyName === id) return "prop";
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
      || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
      || ts.isBindingElement(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
      || ts.isEnumDeclaration(parent) || ts.isTypeParameterDeclaration(parent)) && parent.name === id) return "decl";
  if (ts.isShorthandPropertyAssignment(parent)) return "load";
  return "load";
}

class Scope {
  constructor(node, parent) { this.node = node; this.parent = parent; this.bound = new Set(); this.slots = []; }
}

/**
 * {parts, literalMoves, fallbacks}. `evaluate(exprText)` returns the wire call that the trusted prelude
 * builds from a literal call expression (JavaScript text of literals and API names only), or null.
 */
export function tsAstBits(file, vocab, evaluate) {
  const api = [...new Set(vocab.api)].sort();
  const apiSet = new Set(api), mutators = new Set(vocab.mutators), areas = new Set(vocab.areas);
  const externals = new Set([...ES_GLOBALS, ...api]);
  const pExt = n => 0.5 * (ES_GLOBALS.includes(n) ? 1 / ES_GLOBALS.length : 0) + 0.5 * (apiSet.has(n) ? 1 / api.length : 0)
    || 1 / externals.size;
  const props = new Set([...vocab.attrs, ...vocab.params]);
  const strings = new Set(vocab.strings);
  const bits = { structure: 0, names: 0, literals: 0, moveFlags: 0 };
  const literalMoves = [], fallbacks = [];

  // Binder: the scope each declaration binds in (function-like nodes and the file).
  const scopeOf = new Map(), declScope = new Map();
  const root = new Scope(file, null);
  scopeOf.set(file, root);
  const bindIn = (id, scope) => { scope.bound.add(id.text); declScope.set(id, scope); };
  (function bindVisit(node, scope) {
    let inner = scope;
    if (FUNCTIONS.has(node.kind)) {
      inner = new Scope(node, scope);
      scopeOf.set(node, inner);
      if (ts.isFunctionDeclaration(node) && node.name) bindIn(node.name, scope);
      if (ts.isFunctionExpression(node) && node.name) bindIn(node.name, inner);
    }
    if (ts.isClassDeclaration(node) && node.name) bindIn(node.name, scope);
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) bindIn(node.name, scope);
    if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
      if (ts.isIdentifier(node.name)) bindIn(node.name, ts.isParameter(node) ? inner : scope);
    }
    ts.forEachChild(node, child => bindVisit(child, inner));
  })(file, root);
  root.slots.push("agent");

  const visible = s => { const out = []; for (let t = s; t; t = t.parent) out.push(t); return out; };
  const resolve = (s, name) => { for (let t = s; t; t = t.parent) if (t.bound.has(name)) return t; return externals.has(name) ? "ext" : root; };
  const isExt = (s, name) => resolve(s, name) === "ext";

  function load(s, name) {
    const nUser = visible(s).reduce((n, v) => n + v.slots.length + 1, 0);
    const r = resolve(s, name);
    if (r === "ext") { bits.names += -log2(P_EXT * pExt(name)); return; }
    if (!r.slots.includes(name)) r.slots.push(name);
    bits.names += -log2((1 - P_EXT) / nUser);
  }
  function store(scope, name) {
    bits.names += log2(scope.slots.length + 1);
    if (!scope.slots.includes(name)) scope.slots.push(name);
  }
  function propName(text) {
    bits.names += props.has(text) ? 1 + log2(props.size) : 1 + stringBits(text);
  }
  function stringLiteral(text) {
    bits.literals += strings.has(text) ? -log2(P_STRVOC / strings.size) : -log2(1 - P_STRVOC) + stringBits(text);
  }
  function numeric(text) {
    const v = Number(text.replace(/_/g, ""));
    if (Number.isSafeInteger(v) && v >= 0) bits.literals += gamma(v + 1);
    else bits.literals += floatBits(String(v));
  }

  // Literal JavaScript text for a literal argument, or throw.
  function literal(e, s) {
    if (ts.isNumericLiteral(e)) return String(Number(e.text));
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return JSON.stringify(e.text);
    if (e.kind === K.TrueKeyword) return "true";
    if (e.kind === K.FalseKeyword) return "false";
    if (e.kind === K.NullKeyword) return "null";
    if (ts.isPrefixUnaryExpression(e) && (e.operator === K.MinusToken || e.operator === K.PlusToken)
        && ts.isNumericLiteral(e.operand)) return (e.operator === K.MinusToken ? "-" : "") + String(Number(e.operand.text));
    if (ts.isArrayLiteralExpression(e)) return `[${e.elements.map(x => literal(x, s)).join(",")}]`;
    if (ts.isObjectLiteralExpression(e)) {
      return `{${e.properties.map(p => {
        if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) throw new Error("not literal");
        return `${JSON.stringify(p.name.text)}:${literal(p.initializer, s)}`;
      }).join(",")}}`;
    }
    if (ts.isParenthesizedExpression(e)) return literal(e.expression, s);
    if (ts.isIdentifier(e) && apiSet.has(e.text) && isExt(s, e.text)) return e.text;   // checked non-callable by evaluate
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && areas.has(e.expression.text)
        && isExt(s, e.expression.text) && !e.typeArguments) return `${e.expression.text}(${e.arguments.map(x => literal(x, s)).join(",")})`;
    throw new Error("not literal");
  }
  function literalMove(call, s) {
    const f = call.expression;
    if (!ts.isIdentifier(f) || !mutators.has(f.text) || !isExt(s, f.text) || call.typeArguments) return null;
    let text;
    try { text = `${f.text}(${call.arguments.map(a => literal(a, s)).join(",")})`; } catch { return null; }
    return evaluate(text);
  }

  function visitNode(node, parent, s, inArray) {
    const cat = category(node, parent);
    if (cat) bits.structure += log2(cat.size + (inArray ? 1 : 0));
    walk(node, parent, s);
  }
  function walk(node, parent, s) {
    if (ts.isIdentifier(node)) {
      const r = role(node, parent);
      if (r === "prop") propName(node.text);
      else if (r === "decl") store(declScope.get(node) ?? s, node.text);
      else load(s, node.text);
      return;
    }
    if (ts.isPrivateIdentifier(node)) { propName(node.text); return; }
    if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) { numeric(node.text); return; }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (parent && (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) propName(node.text);
      else stringLiteral(node.text);
      return;
    }
    if (ts.isRegularExpressionLiteral(node)) { bits.literals += stringBits(node.text); return; }
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) { bits.literals += stringBits(node.text); return; }
    if (ts.isPrefixUnaryExpression(node)) bits.structure += log2(6);
    if (ts.isPostfixUnaryExpression(node)) bits.structure += 1;
    if (ts.isVariableDeclarationList(node)) bits.structure += log2(3);
    if (ts.isCallExpression(node)) {
      const wire = literalMove(node, s);
      if (wire) {
        const saved = { ...bits };
        bits.moveFlags += -log2(1 - Q_MOVE);
        children(node, s);
        const total = Object.values(bits).reduce((a, b) => a + b, 0) - Object.values(saved).reduce((a, b) => a + b, 0);
        Object.assign(bits, saved);
        literalMoves.push(wire); fallbacks.push(total);
        return;
      }
      bits.moveFlags += -log2(1 - Q_MOVE);
    }
    children(node, scopeOf.get(node) ?? s);
  }
  function children(node, s) {
    ts.forEachChild(node,
      child => visitNode(child, node, s, false),
      array => {
        const cat = array.length ? category(array[0], node) : null;
        for (const child of array) visitNode(child, node, s, true);
        if (cat) bits.structure += log2(cat.size + 1);
      });
  }
  children(file, root);
  return { parts: bits, literalMoves, fallbacks };
}
