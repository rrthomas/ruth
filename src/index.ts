import fs from 'fs'
import fsExtra from 'fs-extra' // See https://github.com/jprichardson/node-fs-extra/issues/919
import path from 'path'
import Debug from 'debug'
import assert from 'assert'
import execa from 'execa'
import slimdom from 'slimdom'
import {sync as parseXML} from 'slimdom-sax-parser'
import formatXML from 'xml-formatter'
import {
  evaluateXPath, evaluateXPathToNodes, evaluateXPathToFirstNode, Options,
  registerCustomXPathFunction, registerXQueryModule, XMLSerializer,
} from 'fontoxpath'

const debug = Debug('ruth')

export function stripPathPrefix(s: string, prefix: string): string {
  if (s.startsWith(prefix + path.sep)) {
    return path.join(s.slice(prefix.length + path.sep.length))
  }
  return s === prefix ? '' : s
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

// FIXME: `throwIfNoEntry` is missing in TypeScript types for Node 14:
// https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/55786
function statSync(file: string): fs.Stats {
  return (fs as any).statSync(file, {throwIfNoEntry: false})
}

type FullDirent = fs.Dirent & {path: string}
type File = string
type Directory = FullDirent[]
type Dirent = File | Directory | undefined
function isFile(object: Dirent): object is File {
  return typeof object === 'string'
}
function isDirectory(object: Dirent): object is Directory {
  return Array.isArray(object)
}

const ruth = 'https://github.com/rrthomas/ruth/raw/main/ruth.dtd'
const dirtree = 'https://github.com/rrthomas/ruth/raw/main/dirtree.dtd'
const URI_BY_PREFIX: {[key: string]: string} = {ruth, dirtree}

const xQueryOptions: Options = {
  namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
  language: evaluateXPath.XQUERY_3_1_LANGUAGE,
  debug: process.env.DEBUG !== undefined,
  xmlSerializer: new slimdom.XMLSerializer() as XMLSerializer,
}

type Variables = {[id: string]: any}

function loadModule(file: string) {
  const module = fs.readFileSync(file, 'utf-8')
  registerXQueryModule(module)
  const matches = /^\s*module\s+namespace\s+([^= ]+)\s*=\s*"([^"]+)"\s*;\s*$/m.exec(module)
  // If there was no module declaration, registerXQueryModule would have errored,
  // so if 'matches' is null, the parser (regex above) needs improving.
  assert(matches !== null)
  if (xQueryOptions.moduleImports === undefined) {
    xQueryOptions.moduleImports = {}
  }
  const prefix = matches[1]
  const url = matches[2]
  xQueryOptions.moduleImports[prefix] = url
  debug(`registered prefix ${prefix} for URL ${url}`)
}

export class Expander {
  private xtree: slimdom.Document

  constructor(
    private inputs: string[],
    private xmlExtensions: string[] = [],
  ) {
    this.xmlExtensions = this.xmlExtensions.concat('.xml', '.xhtml')
    loadModule(path.join(__dirname, 'ruth.xq'))
    loadModule(path.join(__dirname, 'functx.xq'))
    // FIXME: registerCustomXPathFunction only works once, so can only use Expander once.
    // See https://github.com/FontoXML/fontoxpath/issues/406
    registerCustomXPathFunction(
      {localName: 'eval', namespaceURI: ruth},
      ['xs:string'], 'node()*',
      (_, query: string): slimdom.Node[] => {
        debug(`ruth:eval(${query}); context ${this.xQueryVariables.ruth_element.getAttributeNS(dirtree, 'path')}`)
        return evaluateXPathToNodes(
          query.toString(), // FIXME: query should be of type string!
          this.xQueryVariables.ruth_element,
          null,
          this.xQueryVariables,
          xQueryOptions,
        )
      },
    )
    registerCustomXPathFunction(
      {localName: 'map', namespaceURI: ruth},
      ['xs:string', 'xs:string', 'node()*'], 'node()*',
      (_, query: string, transformQuery: string, nodes: slimdom.Node[]) => {
        debug(`ruth:map(${query}, ${transformQuery}, ${nodes})`)
        const resultNodes = []
        for (const node of nodes) {
          let nodeClone = node.cloneNode(true)
          const elems = evaluateXPathToNodes(
            query, nodeClone, null, this.xQueryVariables, xQueryOptions,
          ) as slimdom.Element[]
          for (const elem of elems) {
            const res = evaluateXPathToFirstNode(
              transformQuery, elem, null, this.xQueryVariables, xQueryOptions,
            ) as slimdom.Element
            if (elem === nodeClone) { // We matched the entire node, so replace it in results.
              nodeClone = res
            } else { // We matched part of the node, replace the match.
              elem.replaceWith(res)
            }
          }
          resultNodes.push(nodeClone)
        }
        return resultNodes
      },
    )
    registerCustomXPathFunction(
      {localName: 'real-path', namespaceURI: ruth},
      ['xs:string'], 'xs:string',
      (_, relPath: string): string => {
        debug(`ruth:absolute-path(${relPath})`)
        const dirent = this.findObject(path.join(this.xQueryVariables.ruth_path, relPath))
        if (isFile(dirent)) {
          return dirent
        }
        throw new Error(`${relPath} is not a file`)
      },
    )
    this.xtree = this.dirTreeToXml('')
  }

  // Find the first file or directory with path `object` in the input tree,
  // scanning the roots from left to right.
  // If the result is a file, return its file system path.
  // If the result is a directory, return its contents as a map from tree
  // paths to file system `fs.Dirent`s, obtained by similarly scanning the
  // tree from left to right.
  // If something neither a file nor directory is found, raise an error.
  // If no result is found, return `undefined`.
  private findObject(object: string): Dirent {
    const dirs = []
    for (const root of this.inputs) {
      const stats = statSync(root)
      if (stats !== undefined && (statSync(root).isDirectory() || object === '')) {
        const objectPath = path.join(root, object)
        const stats = statSync(objectPath)
        if (stats !== undefined) {
          if (stats.isFile()) {
            return objectPath
          }
          if (stats.isDirectory()) {
            dirs.push(objectPath)
          } else {
            throw new Error(`${objectPath} is not a file or directory`)
          }
        }
      }
    }
    const dirents: Directory = []
    for (const dir of dirs.reverse()) {
      for (const dirent of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullDirent: FullDirent = dirent as FullDirent
        fullDirent.path = path.join(dir, dirent.name)
        dirents.push(fullDirent)
      }
    }
    return dirs.length > 0 ? dirents : undefined
  }

  private static templateRegex = /\.ruth([0-9]+)?(?=\.[^.]|$)/

  private static noCopyRegex = /\.in(?=\.[^.]|$)/

  private dirTreeToXml(root: string) {
    const xtree = new slimdom.Document()
    const objToNode = (obj: string) => {
      const realObj = this.findObject(obj)
      const parsedPath = path.parse(obj)
      let elem: slimdom.Element
      debug(`dirTreeToXml: considering ${obj}`)
      if (isDirectory(realObj)) {
        debug('processing directory')
        elem = xtree.createElementNS(dirtree, 'directory')
        const dir = realObj.filter((dirent) => dirent.name[0] !== '.')
        const dirs = dir.filter((dirent) => dirent.isDirectory()).sort()
        const files = dir.filter((dirent) => dirent.isFile() || dirent.isSymbolicLink()).sort()
        dirs.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
        files.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
      } else if (isFile(realObj)) {
        debug('processing file')
        if (isExecutable(realObj)) {
          const localName = (/^[^.]*/.exec(parsedPath.name) as string[])[0]
          const exec = (_: any, args: string[], input?: string): string => execa.sync(
            fs.realpathSync(realObj), args, {input},
          ).stdout
          registerCustomXPathFunction(
            {localName, namespaceURI: ruth}, ['xs:string*'], 'xs:string', exec,
          )
          registerCustomXPathFunction(
            {localName, namespaceURI: ruth}, ['xs:string*', 'xs:string'], 'xs:string', exec,
          )
          elem = xtree.createElementNS(dirtree, 'file')
        } else if (this.xmlExtensions.includes(parsedPath.ext)) {
          debug('reading as XML')
          const text = fs.readFileSync(realObj, 'utf-8')
          const wrappedText = `<dirtree:file>${text}</dirtree:file>`
          let doc
          try {
            doc = parseXML(wrappedText, {additionalNamespaces: URI_BY_PREFIX})
          } catch (error) {
            throw new Error(`error parsing '${obj}': ${error}`)
          }
          assert(doc.documentElement !== null)
          elem = doc.documentElement
        } else {
          debug('not reading as XML')
          if (/.xq[lmy]?/.test(parsedPath.ext)) {
            debug('reading as XQuery module')
            loadModule(realObj)
          }
          elem = xtree.createElementNS(dirtree, 'file')
        }
      } else {
        throw new Error(`'${obj}' is not a file or directory`)
      }
      elem.setAttributeNS(dirtree, 'path', obj)
      elem.setAttributeNS(dirtree, 'name', parsedPath.base)
      return elem
    }
    const rootElem = objToNode(root)
    xtree.appendChild(rootElem)
    debug('Input XML')
    debug(formatXML(rootElem.outerHTML, {lineSeparator: '\n'}))
    return xtree
  }

  xQueryVariables: Variables = {}

  private index(filePath: string): slimdom.Element {
    const components = ['']
    if (filePath !== '') {
      components.push(...filePath.split(path.sep))
    }
    const xPathComponents = components.map((c) => `*[@dirtree:name="${c}"]`)
    const query = `/${xPathComponents.join('/')}`
    const node = evaluateXPathToFirstNode(
      query,
      this.xtree,
      null,
      this.xQueryVariables,
      xQueryOptions,
    )
    if (node === null) {
      throw new Error(`no such file or directory '${filePath}'`)
    }
    return node as slimdom.Element
  }

  // Expand breadth-first, updating the tree as we go, so that each
  // expression is evaluated fully in the context of the file in which it
  // occurs, and we avoid multiple evaluations of nodes near the root.
  expand(outputDir: string, buildPath = ''): void {
    const elemQueues: slimdom.Element[][] = []
    const expandElement = (elem: slimdom.Element): void => {
      debug(`expandElement ${elem.getAttributeNS(dirtree, 'path')}`)
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      const outputPath = path.join(outputDir, stripPathPrefix(obj, buildPath))
      if (elem.namespaceURI === dirtree && elem.localName === 'directory') {
        debug('Expanding directory')
        fsExtra.ensureDirSync(outputPath)
        elem.children.filter((child) => child.tagName !== 'directory').forEach(expandElement)
        elem.children.filter((child) => child.tagName === 'directory').forEach(expandElement)
      } else {
        const match = Expander.templateRegex.exec(obj)
        let queue = 0
        if (match && match[1] !== undefined) {
          queue = parseInt(match[1], 10)
        }
        debug(`Adding file '${obj}' to queue ${queue}`)
        if (elemQueues[queue] === undefined) {
          elemQueues[queue] = []
        }
        elemQueues[queue].push(elem)
      }
    }
    expandElement(this.index(buildPath))
    const elemQueue = elemQueues.flat()
    for (const elem of elemQueue) {
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      const fullyExpandElement = (elem: slimdom.Element): slimdom.Element => {
        debug(`Evaluating ${elem.getAttributeNS(dirtree, 'path')}`)
        try {
          debug(`fullyExpandElement ${elem.getAttributeNS(dirtree, 'path')}`)
          return evaluateXPathToFirstNode(
            elem.outerHTML,
            elem,
            null,
            this.xQueryVariables,
            xQueryOptions,
          ) as slimdom.Element
        } catch (error) {
          throw new Error(`error expanding '${obj}': ${error}`)
        }
      }
      const outputPath = path.join(outputDir, stripPathPrefix(obj, buildPath))
        .replace(Expander.templateRegex, '')
      this.xQueryVariables.ruth_path = path.dirname(obj)
      this.xQueryVariables.ruth_element = elem
      const doCopy = !Expander.noCopyRegex.exec(obj)
      if (Expander.templateRegex.exec(obj)) {
        debug(`Expanding ${obj}`)
        const expandedElem = fullyExpandElement(elem)
        elem.replaceWith(expandedElem)
        if (doCopy) {
          debug(`Writing expansion of ${obj} to ${outputPath}`)
          fs.writeFileSync(outputPath, expandedElem.innerHTML)
        }
      } else if (doCopy) {
        const objFullPath = this.findObject(obj)
        if (!isFile(objFullPath)) {
          throw new Error(`${obj} is not a file`)
        }
        fs.copyFileSync(objFullPath, outputPath)
      }
    }
    debug('Final XML')
    if (this.xtree.documentElement !== null) {
      debug(formatXML(this.xtree.documentElement.outerHTML, {lineSeparator: '\n'}))
    }
  }
}

export default Expander
