#!/usr/bin/env node
/**
 * Generates the stub surface of a migration compat client from a vendor SDK's
 * published TypeScript typings (`.d.ts`).
 *
 *   node scripts/gen-sandbox-compat.mjs --platform E2B --entry <index.d.ts> \
 *        --out src/dots/sandbox/compat/e2b/generated.ts [--any name,name] [--skip name,name]
 *
 * Every exported class, function, interface, type alias and enum reachable from
 * the entry file is copied with its exact signature. Class and function bodies
 * become stubs that raise NotImplementedError. The hand-written overlay next to
 * the generated file overrides the members that the DigitalOcean Sandboxes API
 * can serve.
 *
 * The vendor typings are read as data. Nothing from the vendor packages is run.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const platform = args.get("platform");
const entry = path.resolve(args.get("entry"));
const outFile = path.resolve(args.get("out"));
const anyNames = new Set((args.get("any") ?? "").split(",").filter(Boolean));
const skipNames = new Set((args.get("skip") ?? "").split(",").filter(Boolean));
const vendorLabel = args.get("label") ?? platform;
if (!platform || !entry || !outFile) throw new Error("--platform, --entry and --out are required");

const program = ts.createProgram([entry], {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.esnext.disposable.d.ts"],
});
const checker = program.getTypeChecker();
const entrySf = program.getSourceFile(entry);
const entryModule = checker.getSymbolAtLocation(entrySf);
if (!entryModule) throw new Error("entry is not a module");

const isLib = (sf) => program.isSourceFileDefaultLibrary(sf) || program.isSourceFileFromExternalLibrary(sf);
const vendorDeclarations = (sym) =>
    (sym.declarations ?? []).filter((d) => !isLib(d.getSourceFile()) && !d.getSourceFile().fileName.includes("/node_modules/"));

function resolve(sym) {
    let s = sym;
    const seen = new Set();
    while (s && s.flags & ts.SymbolFlags.Alias && !seen.has(s)) {
        seen.add(s);
        let next;
        try {
            next = checker.getAliasedSymbol(s);
        } catch {
            return undefined;
        }
        if (!next || next === s) return undefined;
        s = next;
    }
    return s;
}

/** exported name -> resolved symbol (undefined when it is an unresolved external) */
const exportsMap = new Map();
for (const e of checker.getExportsOfModule(entryModule)) {
    const r = resolve(e);
    exportsMap.set(e.name, r && vendorDeclarations(r).length ? r : undefined);
}

const included = new Map(); // symbol -> declared name
const externalNames = new Map(); // name -> max type-arg count
const queue = [];
const nameOwner = new Map();

function declName(sym) {
    return sym.name === "default" ? (vendorDeclarations(sym)[0]?.name?.text ?? "Default") : sym.name;
}

function include(sym) {
    if (!sym || included.has(sym)) return;
    const name = declName(sym);
    if (anyNames.has(name) || skipNames.has(name)) return;
    if (nameOwner.has(name) && nameOwner.get(name) !== sym) throw new Error(`name collision: ${name}`);
    nameOwner.set(name, sym);
    included.set(sym, name);
    queue.push(sym);
}

function noteExternal(name, typeArgs) {
    externalNames.set(name, Math.max(externalNames.get(name) ?? 0, typeArgs));
}

function leftmost(node) {
    while (ts.isQualifiedName(node)) node = node.left;
    while (ts.isPropertyAccessExpression(node)) node = node.expression;
    return node;
}

function visitRefs(node) {
    const consider = (nameNode, typeArgs) => {
        const id = leftmost(nameNode);
        if (!ts.isIdentifier(id)) return;
        if (anyNames.has(id.text)) {
            noteExternal(id.text, typeArgs);
            return;
        }
        const sym = checker.getSymbolAtLocation(id);
        if (!sym) {
            if (!isGlobalName(id.text)) noteExternal(id.text, typeArgs);
            return;
        }
        const r = resolve(sym);
        if (!r || (r.flags & ts.SymbolFlags.Alias)) {
            noteExternal(id.text, typeArgs);
            return;
        }
        if (r.flags & ts.SymbolFlags.TypeParameter) return;
        const decls = r.declarations ?? [];
        if (decls.length === 0) {
            if (!isGlobalName(id.text)) noteExternal(id.text, typeArgs);
            return;
        }
        if (decls.every((d) => isLib(d.getSourceFile()))) return;
        if (vendorDeclarations(r).length === 0) {
            noteExternal(id.text, typeArgs);
            return;
        }
        // a local type parameter or a member never gets here; only top-level declarations are included
        if (decls.some((d) => d.parent && (ts.isSourceFile(d.parent) || ts.isModuleBlock(d.parent)))) include(r);
    };
    if (ts.isTypeReferenceNode(node)) consider(node.typeName, node.typeArguments?.length ?? 0);
    else if (ts.isExpressionWithTypeArguments(node)) consider(node.expression, node.typeArguments?.length ?? 0);
    else if (ts.isTypeQueryNode(node)) consider(node.exprName, 0);
    ts.forEachChild(node, visitRefs);
}

function isGlobalName(n) {
    return !!checker.resolveName?.(n, undefined, ts.SymbolFlags.Type | ts.SymbolFlags.Value, false);
}

for (const sym of exportsMap.values()) include(sym);
for (const [name, sym] of exportsMap) if (!sym && !anyNames.has(name) && name !== "default") noteExternal(name, 0);
while (queue.length) {
    const sym = queue.shift();
    for (const d of vendorDeclarations(sym)) visitRefs(d);
}

// ---------------------------------------------------------------- emission

const NEEDS = [
    [/^(files|filesystem|fs|file|upload|download|read|write|list_?files|listFiles|watch|stat|copy|move|remove|mkdir|makeDir|rename|exists|getFile|setFile|batch|uploadFile|downloadFile|sandboxFilesystem)/i, "a file upload and download API"],
    [/pty|terminal|resize|sendInput/i, "a PTY API"],
    [/port|host|tunnel|preview|url|domain|proxy|connectToken|createConnect/i, "a ports and tunnels API"],
    [/volume|mount|nfs|disk/i, "a volumes API"],
    [/snapshot|fork|restore|checkpoint/i, "a snapshot restore API"],
    [/git/i, "a git API"],
    [/lsp|language/i, "a language server API"],
    [/interpreter|runCode|codeRun|context/i, "a code interpreter API"],
    [/computer|mouse|keyboard|screenshot|display|recording/i, "a computer use API"],
    [/timeout|lifetime|ttl|keepalive|autoStop|autoPause|autoArchive|autoDelete|setTimeout/i, "a sandbox lifetime API"],
    [/metric|stats|log|event|usage/i, "a metrics and logs API"],
    [/secret/i, "a secrets API"],
    [/network|egress|ingress|allow|policy|firewall/i, "a network policy API"],
    [/tag|label|metadata/i, "a sandbox metadata API"],
];
function needsFor(cls, member) {
    const key = `${member}`;
    for (const [re, text] of NEEDS) if (re.test(key)) return text;
    for (const [re, text] of NEEDS) if (re.test(cls)) return text;
    return "a DigitalOcean Sandboxes API that does not exist yet";
}

const stubs = []; // [class, member, isStatic, kind, isAsync]
const warnings = [];

function replacementsText(node) {
    const start = node.getStart();
    const end = node.getEnd();
    const ops = [];
    (function walk(n) {
        if (ts.isImportTypeNode(n)) {
            ops.push([n.getStart(), n.getEnd(), "any"]);
            return;
        }
        ts.forEachChild(n, walk);
    })(node);
    const sf = node.getSourceFile();
    const src = sf.text;
    let out = "";
    let pos = start;
    for (const [s, e, t] of ops.sort((a, b) => a[0] - b[0])) {
        out += src.slice(pos, s) + t;
        pos = e;
    }
    return out + src.slice(pos, end);
}

const hasMod = (node, kind) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
const nameText = (n) => (n.name ? (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : n.name.getText()) : "");
const isPromiseReturn = (m) => !!m.type && /^Promise\s*</.test(m.type.getText());

function paramsText(m) {
    return m.parameters.map((p) => replacementsText(p)).join(", ");
}

function typeParamsText(m) {
    return m.typeParameters?.length ? `<${m.typeParameters.map((t) => replacementsText(t)).join(", ")}>` : "";
}

function stubBody(cls, member) {
    return `throw notImplemented(${JSON.stringify(platform)}, ${JSON.stringify(cls ? `${cls}.${member}` : member)}, ${JSON.stringify(needsFor(cls ?? "", member))});`;
}

function emitClass(name, decls, out) {
    const classDecls = decls.filter(ts.isClassDeclaration);
    const decl = classDecls[0];
    const tp = typeParamsText(decl);
    let heritage = "";
    const ext = decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
    let hasSuper = false;
    if (ext) {
        const t = ext.types[0];
        const id = leftmost(t.expression);
        const sym = ts.isIdentifier(id) ? checker.getSymbolAtLocation(id) : undefined;
        const r = sym ? resolve(sym) : undefined;
        const isIncluded = r && included.has(r);
        const isGlobal = r && (r.declarations ?? []).every((d) => isLib(d.getSourceFile()));
        if (isIncluded || isGlobal) {
            heritage = ` extends ${replacementsText(t)}`;
            hasSuper = true;
        }
    }
    const impls = [];
    const imp = decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword);
    if (imp) {
        for (const t of imp.types) {
            const id = leftmost(t.expression);
            const sym = ts.isIdentifier(id) ? checker.getSymbolAtLocation(id) : undefined;
            const r = sym ? resolve(sym) : undefined;
            if (r && included.has(r)) impls.push(replacementsText(t));
        }
    }
    const abstractPrefix = "";
    out.push(`export class ${name}${tp}${heritage}${impls.length ? ` implements ${impls.join(", ")}` : ""} {`);

    // group methods by (static, name)
    const methods = new Map();
    const order = [];
    for (const decl2 of classDecls) {
        for (const m of decl2.members) {
            if (hasMod(m, ts.SyntaxKind.PrivateKeyword)) continue;
            if (m.name && ts.isPrivateIdentifier(m.name)) continue;
            // A stub for Symbol.hasInstance would break `instanceof` for the class.
            if (m.name && ts.isComputedPropertyName(m.name) && /hasInstance/.test(m.name.getText())) continue;
            if (ts.isMethodDeclaration(m)) {
                const key = `${hasMod(m, ts.SyntaxKind.StaticKeyword) ? "s" : "i"}:${nameText(m)}`;
                if (!methods.has(key)) {
                    methods.set(key, []);
                    order.push(["method", key]);
                }
                methods.get(key).push(m);
            } else order.push(["member", m]);
        }
    }
    const emittedAccessors = new Set();
    for (const [kind, v] of order) {
        if (kind === "method") {
            const ms = methods.get(v);
            const isStatic = v.startsWith("s:");
            const mname = nameText(ms[0]);
            const mods = [hasMod(ms[0], ts.SyntaxKind.ProtectedKeyword) ? "protected" : "", isStatic ? "static" : ""].filter(Boolean).join(" ");
            const prefix = mods ? `${mods} ` : "";
            const key = ts.isIdentifier(ms[0].name) || ts.isStringLiteral(ms[0].name) ? (/^[A-Za-z_$][\w$]*$/.test(mname) ? mname : JSON.stringify(mname)) : ms[0].name.getText();
            const opt = ms[0].questionToken ? "?" : "";
            const allPromise = ms.every(isPromiseReturn);
            stubs.push([name, mname, isStatic, "method", allPromise]);
            if (ms.length === 1) {
                const m = ms[0];
                out.push(`    ${prefix}${allPromise ? "async " : ""}${key}${opt}${typeParamsText(m)}(${paramsText(m)})${m.type ? `: ${replacementsText(m.type)}` : ""} {`);
                out.push(`        ${stubBody(name, mname)}`);
                out.push("    }");
            } else {
                for (const m of ms) out.push(`    ${prefix}${key}${opt}${typeParamsText(m)}(${paramsText(m)})${m.type ? `: ${replacementsText(m.type)}` : ""};`);
                out.push(`    ${prefix}${allPromise ? "async " : ""}${key}(...args: any[]): ${allPromise ? "Promise<any>" : "any"} {`);
                out.push(`        ${stubBody(name, mname)}`);
                out.push("    }");
            }
            continue;
        }
        const m = v;
        if (ts.isPropertyDeclaration(m)) {
            const isStatic = hasMod(m, ts.SyntaxKind.StaticKeyword);
            const ro = hasMod(m, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";
            const prot = hasMod(m, ts.SyntaxKind.ProtectedKeyword) ? "protected " : "";
            const pname = nameText(m);
            const key = /^[A-Za-z_$][\w$]*$/.test(pname) ? pname : m.name.getText();
            const optional = m.questionToken ? "?" : "!";
            out.push(`    ${prot}${isStatic ? "static " : ""}${ro}${key}${optional}: ${m.type ? replacementsText(m.type) : "any"};`);
        } else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
            const isStatic = hasMod(m, ts.SyntaxKind.StaticKeyword);
            const aname = nameText(m);
            const key = `${isStatic ? "s" : "i"}:${aname}:${ts.isGetAccessor(m) ? "g" : "s"}`;
            if (emittedAccessors.has(key)) continue;
            emittedAccessors.add(key);
            const prefix = `${hasMod(m, ts.SyntaxKind.ProtectedKeyword) ? "protected " : ""}${isStatic ? "static " : ""}`;
            if (ts.isGetAccessor(m)) {
                out.push(`    ${prefix}get ${aname}()${m.type ? `: ${replacementsText(m.type)}` : ""} {`);
                out.push(`        ${stubBody(name, aname)}`);
                out.push("    }");
                stubs.push([name, aname, isStatic, "getter", false]);
            } else {
                out.push(`    ${prefix}set ${aname}(${paramsText(m)}) {`);
                out.push(`        ${stubBody(name, aname)}`);
                out.push("    }");
            }
        } else if (ts.isConstructorDeclaration(m)) {
            const prot = hasMod(m, ts.SyntaxKind.ProtectedKeyword) ? "protected " : hasMod(m, ts.SyntaxKind.PrivateKeyword) ? "private " : "";
            out.push(`    ${prot}constructor(${paramsText(m)});`);
        } else if (ts.isIndexSignatureDeclaration(m)) {
            out.push(`    ${replacementsText(m)}`);
        } else if (ts.isClassStaticBlockDeclaration?.(m)) {
            // d.ts files have none
        } else {
            warnings.push(`${name}: skipped member kind ${ts.SyntaxKind[m.kind]}`);
        }
    }
    if (order.some(([k, v]) => k === "member" && ts.isConstructorDeclaration(v))) {
        out.push(`    constructor(...args: any[]) {`);
        if (hasSuper) out.push(`        super(...(args as any));`);
        out.push("    }");
    } else if (hasSuper) {
        // inherited constructor: nothing to emit
    }
    out.push("}");
    void abstractPrefix;
}

function emitFunction(name, decls, out) {
    const fns = decls.filter(ts.isFunctionDeclaration);
    const allPromise = fns.every(isPromiseReturn);
    stubs.push([null, name, true, "function", allPromise]);
    const sig = (f) => `${typeParamsText(f)}(${paramsText(f)})${f.type ? `: ${replacementsText(f.type)}` : ""}`;
    if (fns.length === 1) {
        out.push(`export ${allPromise ? "async " : ""}function ${name}${sig(fns[0])} {`);
        out.push(`    ${stubBody(null, name)}`);
        out.push("}");
    } else {
        for (const f of fns) out.push(`export function ${name}${sig(f)};`);
        out.push(`export ${allPromise ? "async " : ""}function ${name}(...args: any[]): ${allPromise ? "Promise<any>" : "any"} {`);
        out.push(`    ${stubBody(null, name)}`);
        out.push("}");
    }
}

const body = [];
const header = [];
const classNames = [];

// A class must be defined after the class it extends.
function ordered() {
    const out = [];
    const seen = new Set();
    const visit = (sym) => {
        if (seen.has(sym)) return;
        seen.add(sym);
        for (const d of vendorDeclarations(sym).filter(ts.isClassDeclaration)) {
            const ext = d.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
            const id = ext && leftmost(ext.types[0].expression);
            const base = id && ts.isIdentifier(id) ? checker.getSymbolAtLocation(id) : undefined;
            const r = base ? resolve(base) : undefined;
            if (r && included.has(r)) visit(r);
        }
        out.push([sym, included.get(sym)]);
    };
    for (const sym of included.keys()) visit(sym);
    return out;
}

for (const [sym, name] of ordered()) {
    const decls = vendorDeclarations(sym);
    const kinds = new Set(decls.map((d) => ts.SyntaxKind[d.kind]));
    const cls = decls.filter(ts.isClassDeclaration);
    if (cls.length) {
        classNames.push(name);
        for (const d of decls) {
            if (ts.isInterfaceDeclaration(d)) body.push(`export interface ${name}${typeParamsText(d)}${heritageText(d)} ${membersText(d)}`);
        }
        emitClass(name, decls, body);
    } else if (decls.some(ts.isFunctionDeclaration)) {
        emitFunction(name, decls, body);
        for (const d of decls) {
            if (ts.isModuleDeclaration(d)) body.push(`export declare namespace ${name} ${replacementsText(d.body)}`);
        }
    } else {
        for (const d of decls) {
            if (ts.isInterfaceDeclaration(d)) body.push(`export interface ${name}${typeParamsText(d)}${heritageText(d)} ${membersText(d)}`);
            else if (ts.isTypeAliasDeclaration(d)) body.push(`export type ${name}${typeParamsText(d)} = ${replacementsText(d.type)};`);
            else if (ts.isEnumDeclaration(d)) body.push(`export ${hasMod(d, ts.SyntaxKind.ConstKeyword) ? "" : ""}enum ${name} ${enumBody(d)}`);
            else if (ts.isModuleDeclaration(d)) body.push(`export declare namespace ${name} ${replacementsText(d.body)}`);
            else if (ts.isVariableDeclaration(d)) {
                if (d.initializer) body.push(`export const ${name}${d.type ? `: ${replacementsText(d.type)}` : ""} = ${replacementsText(d.initializer)};`);
                else if (decls.some((x) => ts.isInterfaceDeclaration(x) || ts.isTypeAliasDeclaration(x))) {
                    // a type with a same-named companion object (protobuf messages): types only
                } else {
                    body.push(`export const ${name}: ${d.type ? replacementsText(d.type) : "any"} = undefined as any;`);
                    warnings.push(`${name}: value declaration emitted as undefined`);
                }
            } else warnings.push(`${name}: skipped ${ts.SyntaxKind[d.kind]} (${[...kinds].join(",")})`);
        }
    }
}

function heritageText(d) {
    if (!d.heritageClauses) return "";
    const parts = [];
    for (const h of d.heritageClauses) {
        const types = h.types.filter((t) => {
            const id = leftmost(t.expression);
            const sym = ts.isIdentifier(id) ? checker.getSymbolAtLocation(id) : undefined;
            const r = sym ? resolve(sym) : undefined;
            return r && (included.has(r) || (r.declarations ?? []).every((x) => isLib(x.getSourceFile())));
        });
        if (types.length) parts.push(`${h.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements"} ${types.map((t) => replacementsText(t)).join(", ")}`);
    }
    return parts.length ? ` ${parts.join(" ")}` : "";
}
function membersText(d) {
    return `{\n${d.members.map((m) => `    ${replacementsText(m)}${/[;,]$/.test(replacementsText(m)) ? "" : ";"}`).join("\n")}\n}`;
}
function enumBody(d) {
    return `{\n${d.members.map((m) => `    ${replacementsText(m)},`).join("\n")}\n}`;
}

// export aliases and default
const aliasLines = [];
for (const [exportName, sym] of exportsMap) {
    if (exportName === "default") continue;
    if (!sym) continue;
    const name = included.get(sym);
    if (!name || name === exportName) continue;
    const isValue = !!(sym.flags & ts.SymbolFlags.Value);
    aliasLines.push(isValue ? `export { ${name} as ${exportName} };` : `export type ${exportName} = ${name};`);
}
const defaultSym = exportsMap.get("default");
if (defaultSym && included.has(defaultSym)) aliasLines.push(`export default ${included.get(defaultSym)};`);

for (const [n, argc] of [...externalNames].sort()) {
    if (included.has([...included.keys()].find((s) => included.get(s) === n))) continue;
    const params = Array.from({ length: argc }, (_, i) => `_T${i} = any`).join(", ");
    header.push(`export type ${n}${argc ? `<${params}>` : ""} = any;`);
}

const rel = path.relative(path.dirname(outFile), path.resolve(path.dirname(outFile), "..", "errors.js")).replace(/\\/g, "/");
const text = [
    `/* eslint-disable */`,
    `// @ts-nocheck`,
    `/**`,
    ` * GENERATED by scripts/gen-sandbox-compat.mjs from ${vendorLabel}. Do not edit.`,
    ` *`,
    ` * Signature-compatible stubs for the public surface of the ${platform} SDK. Every member raises`,
    ` * NotImplementedError. The overlay in this directory overrides what DigitalOcean Sandboxes serves.`,
    ` * Type and member shapes are copied from the vendor's published typings (Apache-2.0).`,
    ` */`,
    `import { notImplemented } from "${rel.startsWith(".") ? rel : "./" + rel}";`,
    ``,
    `// Types that come from packages this module does not depend on.`,
    ...header,
    ``,
    ...body,
    ``,
    ...aliasLines,
    ``,
    `/** [class, member, static, kind, async] for every stub. The compat tests walk this table. */`,
    `export const STUBS: ReadonlyArray<readonly [string | null, string, boolean, "method" | "getter" | "function", boolean]> = ${JSON.stringify(stubs)};`,
    ``,
].join("\n");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, text);
console.log(
    `${platform}: ${included.size} declarations (${classNames.length} classes), ${stubs.length} stubs, ${externalNames.size} external types, ${warnings.length} warnings`,
);
for (const w of warnings.slice(0, 40)) console.log("  warn:", w);
