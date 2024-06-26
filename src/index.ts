import fs from 'fs-extra'
import path from 'path'
import url from 'url'
import Debug from 'debug'
import assert from 'assert'
import {execaSync} from 'execa'
import * as slimdom from 'slimdom'
import formatXML, {XMLFormatterOptions} from 'xml-formatter'
import fontoxpath, {Options, XMLSerializer} from 'fontoxpath'

const {
  evaluateXPath, evaluateXPathToNodes, evaluateXPathToFirstNode,
  registerCustomXPathFunction, registerXQueryModule,
} = fontoxpath

const debug = Debug('ruth')

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * An `fs.Dirent` with an extra member `path`, which is the full path of the
 * object.
 */
export type FullDirent = fs.Dirent & {path: string}
export type File = string
export type Directory = FullDirent[]
/**
 * A File (just its name) or Directory (a list of {@link FullDirent}).
 */
export type Dirent = File | Directory
function isFile(object: Dirent): object is File {
  return typeof object === 'string'
}
function isDirectory(object: Dirent): object is Directory {
  return Array.isArray(object)
}

const ruth = 'https://github.com/rrthomas/ruth/raw/main/ruth.dtd'
const dirtree = 'https://github.com/rrthomas/ruth/raw/main/dirtree.dtd'
const URI_BY_PREFIX: {[key: string]: string} = {ruth, dirtree}

function resolveNamespacePrefix(prefix: string): string | undefined {
  return URI_BY_PREFIX[prefix]
}

const xQueryOptions: Options = {
  namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
  language: evaluateXPath.XQUERY_3_1_LANGUAGE,
  debug: process.env.DEBUG !== undefined,
  xmlSerializer: new slimdom.XMLSerializer() as XMLSerializer,
}

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

// Load XQuery modules.
loadModule(url.fileURLToPath(new URL('ruth.xq', import.meta.url)))
loadModule(url.fileURLToPath(new URL('functx.xq', import.meta.url)))

export class XmlDir {
  public xtree: slimdom.Document

  constructor(
    private inputs: string[],
    private xmlExtensions: string[] = [],
  ) {
    this.xmlExtensions = this.xmlExtensions.concat('.xml', '.xhtml')
    // FIXME: registerCustomXPathFunction only works once, so can only use
    // Expander once (doesn't matter for XmlDir, where the functions are not
    // run). See https://github.com/FontoXML/fontoxpath/issues/406
    registerCustomXPathFunction(
      {localName: 'eval', namespaceURI: ruth},
      ['xs:string'],
      'node()*',
      (_, query: string): slimdom.Node[] => {
        debug(`ruth:eval(${query}); context ${this.context!.getAttributeNS(dirtree, 'path')}`)
        return evaluateXPathToNodes(query, this.context, null, undefined, xQueryOptions)
      },
    )
    registerCustomXPathFunction(
      {localName: 'map', namespaceURI: ruth},
      ['xs:string', 'xs:string', 'node()*'],
      'node()*',
      (_, query: string, transformQuery: string, nodes: slimdom.Node[]) => {
        debug(`ruth:map(${query}, ${transformQuery}, ${nodes})`)
        const resultNodes = []
        for (const node of nodes) {
          let nodeClone = node.cloneNode(true)
          const elems = evaluateXPathToNodes(
            query, nodeClone, null, undefined, xQueryOptions,
          ) as slimdom.Element[]
          for (const elem of elems) {
            const res = evaluateXPathToFirstNode(
              transformQuery, elem, null, undefined, xQueryOptions,
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
      ['xs:string'],
      'xs:string',
      (_, relPath: string): string => {
        debug(`ruth:real-path(${relPath})`)
        const dirent = this.findObject(path.join(
          path.dirname(this.context!.getAttributeNS(dirtree, 'path')!),
          relPath,
        ))
        if (dirent !== undefined && isFile(dirent)) {
          return dirent
        }
        throw new Error(`'${relPath}' is not a file`)
      },
    )
    this.xtree = this.dirTreeToXml('')
    if (debug.enabled) {
      debug('Input XML')
      debug(this.formatXML())
    }
  }

  protected context?: slimdom.Element

  // Find the first file or directory with path `object` in the input tree,
  // scanning the roots from left to right.
  // If the result is a file, return its file system path.
  // If the result is a directory, return its contents as a map from tree
  // paths to file system `fs.Dirent`s, obtained by similarly scanning the
  // tree from left to right.
  // If something neither a file nor directory is found, raise an error.
  // If no result is found, return `undefined`.
  protected findObject(object: string): Dirent | undefined {
    const dirs = []
    for (const root of this.inputs) {
      const stats = fs.statSync(root, {throwIfNoEntry: false})
      if (stats !== undefined && (stats.isDirectory() || object === '')) {
        const objectPath = path.join(root, object)
        const stats = fs.statSync(objectPath, {throwIfNoEntry: false})
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

  protected static templateRegex = /\.ruth([0-9]+)?(?=\.[^.]|$)/

  protected static noCopyRegex = /\.in(?=\.[^.]|$)/

  private isXmlFile(parsedPath: path.ParsedPath) {
    return this.xmlExtensions.includes(parsedPath.ext)
  }

  private dirTreeToXml(root: string) {
    const xtree = new slimdom.Document()
    const objToNode = (obj: string) => {
      const realObj = this.findObject(obj)
      const parsedPath = path.parse(obj)
      let elem: slimdom.Element
      debug(`dirTreeToXml: considering ${obj}`)
      if (realObj === undefined) {
        throw new Error(`'${obj}' is not a file or directory`)
      } else if (isDirectory(realObj)) {
        debug('processing directory')
        elem = xtree.createElementNS(dirtree, 'directory')
        const dir = realObj.filter((dirent) => dirent.name[0] !== '.')
        const dirs = dir.filter((dirent) => dirent.isDirectory()).sort()
        const files = dir.filter((dirent) => dirent.isFile() || dirent.isSymbolicLink()).sort()
        dirs.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
        files.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
      } else {
        debug('processing file')
        elem = xtree.createElementNS(dirtree, 'file')
        if (isExecutable(realObj)) {
          const localName = (/^[^.]*/.exec(parsedPath.name) as string[])[0]
          const exec = (_: any, args: string[], input?: string): string => execaSync(
            fs.realpathSync(realObj), args, {input},
          ).stdout
          registerCustomXPathFunction(
            {localName, namespaceURI: ruth}, ['xs:string*'], 'xs:string', exec,
          )
          registerCustomXPathFunction(
            {localName, namespaceURI: ruth}, ['xs:string*', 'xs:string'], 'xs:string', exec,
          )
        } else if (this.isXmlFile(parsedPath)) {
          debug('reading as XML')
          const text = fs.readFileSync(realObj, 'utf-8')
          let doc: slimdom.DocumentFragment
          try {
            doc = slimdom.parseXmlFragment(text, {resolveNamespacePrefix})
          } catch (error) {
            throw new Error(`error parsing '${obj}': ${error}`)
          }
          elem.append(...doc.childNodes)
        } else {
          elem = xtree.createElementNS(dirtree, 'file')
          if (/.xq[lmy]?/.test(parsedPath.ext)) {
            debug('reading as XQuery module')
            loadModule(realObj)
          } else if (XmlDir.templateRegex.test(parsedPath.base)) {
            debug('reading as plain text template')
            elem.textContent = fs.readFileSync(realObj).toString()
          } else {
            debug('not reading file')
          }
        }
      }
      elem.setAttributeNS(dirtree, 'path', obj)
      elem.setAttributeNS(dirtree, 'name', parsedPath.base)
      return elem
    }
    const rootElem = objToNode(root)
    xtree.appendChild(rootElem)
    return xtree
  }

  public formatXML(options?: XMLFormatterOptions) {
    assert(this.xtree.documentElement !== null)
    return formatXML(
      this.xtree.documentElement.outerHTML,
      {lineSeparator: '\n', ...options},
    )
  }
}

export class Expander extends XmlDir {
  private index(filePath: string): slimdom.Element {
    const components = ['']
    if (filePath !== '') {
      components.push(...filePath.split(path.sep))
    }
    const xPathComponents = components.map((c) => `*[@dirtree:name="${c}"]`)
    const query = `/${xPathComponents.join('/')}`
    const node = evaluateXPathToFirstNode(query, this.xtree, null, undefined, xQueryOptions)
    if (node === null) {
      throw new Error(`no such file or directory '${filePath}'`)
    }
    return node as slimdom.Element
  }

  private xQueryErrorRaised = false

  private xQueryError(msg: string) {
    console.warn(msg)
    this.xQueryErrorRaised = true
  }

  // Expand breadth-first, updating the tree as we go, so that each
  // expression is evaluated fully in the context of the file in which it
  // occurs, and we avoid multiple evaluations of nodes near the root.
  expand(outputDir: string, buildPath = ''): void {
    const getOutputPath = (file: string) => {
      assert(file.startsWith(buildPath))
      return path.join(outputDir, file.slice(buildPath.length))
    }
    const elemQueues: slimdom.Element[][] = []
    const addElement = (elem: slimdom.Element): void => {
      debug(`addElement ${elem.getAttributeNS(dirtree, 'path')}`)
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      if (elem.namespaceURI === dirtree && elem.localName === 'directory') {
        debug('Expanding directory')
        fs.ensureDirSync(getOutputPath(obj))
        elem.children.filter((child) => child.tagName !== 'directory').forEach(addElement)
        elem.children.filter((child) => child.tagName === 'directory').forEach(addElement)
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
    addElement(this.index(buildPath))
    const elemQueue = elemQueues.flat()
    for (const elem of elemQueue) {
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      const expandElement = (elem: slimdom.Element): slimdom.Element => {
        debug(`Evaluating ${elem.getAttributeNS(dirtree, 'path')}`)
        try {
          debug(`expandElement ${elem.getAttributeNS(dirtree, 'path')}`)
          return evaluateXPathToFirstNode(
            elem.outerHTML, elem, null, undefined, xQueryOptions,
          ) as slimdom.Element
        } catch (error) {
          this.xQueryError(`error expanding '${obj}': ${error}`)
          return elem
        }
      }
      const outputPath = getOutputPath(obj).replace(Expander.templateRegex, '')
      this.context = elem
      const doCopy = !Expander.noCopyRegex.exec(obj)
      if (Expander.templateRegex.exec(obj)) {
        debug(`Expanding ${obj}`)
        const expandedElem = expandElement(elem)
        elem.replaceWith(expandedElem)
        if (doCopy) {
          debug(`Writing expansion of ${obj} to ${outputPath}`)
          fs.writeFileSync(outputPath, expandedElem.innerHTML)
        }
      } else if (doCopy) {
        const objFullPath = this.findObject(obj)
        assert(objFullPath !== undefined && isFile(objFullPath))
        fs.copyFileSync(objFullPath, outputPath)
      }
    }
    if (debug.enabled) {
      debug('Final XML')
      debug(this.formatXML())
    }
    if (this.xQueryErrorRaised) {
      throw new Error('there were errors during XQuery processing')
    }
  }
}

export default Expander
