import fs from 'fs-extra'
import path from 'path'
import Debug from 'debug'
import assert from 'assert'
import execa from 'execa'
import realFs from 'fs'
import {IFS} from 'unionfs/lib/fs'
import slimdom from 'slimdom'
import {sync as parseXML} from 'slimdom-sax-parser'
import formatXML from 'xml-formatter'
import {
  evaluateXPath, evaluateXPathToFirstNode, Options,
  registerCustomXPathFunction, registerXQueryModule,
} from 'fontoxpath'


const debug = Debug('ruth')

export function stripPathPrefix(s: string, prefix: string): string {
  if (s.startsWith(prefix + path.sep)) {
    return path.join(s.slice(prefix.length + path.sep.length))
  } else if (s === prefix) {
    return ''
  }
  return s
}

const ruth = 'https://github.com/rrthomas/ruth/raw/master/ruth.dtd'
const dirtree = 'https://github.com/rrthomas/ruth/raw/master/dirtree.dtd'
const URI_BY_PREFIX: {[key: string]: string} = {ruth, dirtree}

const xQueryOptions: Options = {
  namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
  language: evaluateXPath.XQUERY_3_1_LANGUAGE,
}

export class Expander {
  private absInput: string

  private xtree: slimdom.Document

  constructor(
    private input: string,
    private inputFs: IFS = realFs,
  ) {
    this.absInput = path.resolve(input)
    this.xtree = this.dirTreeToXML(input)
    registerCustomXPathFunction(
      {localName: 'eval', namespaceURI: ruth},
      ['xs:string'], 'node()',
      (_, query: string): slimdom.Node => {
        const res = evaluateXPathToFirstNode(query, this.xQueryVariables.element, null, this.xQueryVariables, xQueryOptions) as slimdom.Node
        if (res === null) {
          throw new Error(`eval: '${query}' does not give a result`)
        }
        return res
      },
    )
    this.loadModule(path.join(__dirname, 'ruth.xq'))
  }

  private static templateRegex = /\.ruth([0-9])*(?=\.[^.]+$|$)/
  private static noCopyRegex = /\.in(?=\.[^.]+$|$)/

  isExecutable(file: string): boolean {
    try {
      this.inputFs.accessSync(file, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private loadModule(file: string) {
    const module = this.inputFs.readFileSync(file, 'utf-8')
    registerXQueryModule(module)
    const matches = /^\s*module\s+namespace\s+([^= ]+)\s*=\s*"([^"]+)"\s*;\s*$/m.exec(module)
    if (matches !== null) {
      if (xQueryOptions.moduleImports === undefined) {
        xQueryOptions.moduleImports = {}
      }
      const prefix = matches[1]
      const url = matches[2]
      xQueryOptions.moduleImports[prefix] = url
      debug(`registered prefix ${prefix} for URL ${url}`)
    } else {
      debug('no module declaration')
    }
  }

  private dirTreeToXML(root: string) {
    const xtree = new slimdom.Document()
    const objToNode = (obj: string) => {
      const stats = this.inputFs.statSync(obj)
      const parsedPath = path.parse(obj)
      const basename = (/^[^.]*/.exec(parsedPath.name) as string[])[0]
      let elem: slimdom.Element
      debug(`dirTreeToXML: considering ${obj}`)
      if (stats.isDirectory()) {
        debug(`dirTreeToXML: processing directory`)
        elem = xtree.createElementNS(dirtree, 'directory')
        elem.setAttributeNS(dirtree, 'type', 'directory')
        const dir = this.inputFs.readdirSync(obj, {withFileTypes: true})
          .filter(dirent => dirent.name[0] !== '.')
        const dirs = dir.filter(dirent => dirent.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))
        const files = dir.filter(dirent => dirent.isFile() || dirent.isSymbolicLink())
          .sort((a, b) => a.name.localeCompare(b.name))
        dirs.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
        files.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
      } else if (stats.isFile() || stats.isSymbolicLink()) {
        debug(`dirTreeToXML: processing file`)
        if (this.isExecutable(obj)) {
          debug(`creating XQuery function from executable`)
          registerCustomXPathFunction(
            {localName: basename.replace(Expander.noCopyRegex, ''), namespaceURI: ruth},
            // FIXME: 'array(xs:string)' unsupported: https://github.com/FontoXML/fontoxpath/issues/360
            ['array(*)'], 'xs:string',
            (_, args: string[]): string => {
              return execa.sync(path.join(this.absInput, stripPathPrefix(obj, this.input)), args).stdout
            },
          )
          elem = xtree.createElementNS(dirtree, 'executable')
        } else if (['.xml', '.xhtml'].includes(parsedPath.ext)) {
          debug(`reading as XML`)
          const text = this.inputFs.readFileSync(obj, 'utf-8')
          const wrappedText = `<${basename}>${text}</${basename}>`
          let doc
          try {
            doc = parseXML(wrappedText, {additionalNamespaces: URI_BY_PREFIX})
          } catch (error) {
            throw new Error(`error parsing '${obj}': ${error}`)
          }
          assert(doc.documentElement !== null)
          elem = doc.documentElement
        } else {
          debug(`not reading as XML`)
          if (/.xq[lmy]?/.test(parsedPath.ext)) {
            debug(`reading as XQuery module`)
            this.loadModule(obj)
          }
          elem = xtree.createElementNS(dirtree, 'file')
        }
        elem.setAttributeNS(dirtree, 'type', 'file')
      } else {
        throw new Error(`'${obj}' is not a directory or file`)
      }
      elem.setAttributeNS(dirtree, 'path', stripPathPrefix(obj, this.input))
      elem.setAttributeNS(dirtree, 'name', parsedPath.base)
      return elem
    }
    const rootElem = objToNode(root)
    xtree.appendChild(rootElem)
    debug('Input XML')
    debug(formatXML(rootElem.outerHTML))
    return xtree
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xQueryVariables: {[id: string]: any} = {
    // FIXME: Put these variables in ruth namespace.
    // See https://github.com/FontoXML/fontoxpath/issues/381
    root: this.input,
  }

  private index(filePath: string): slimdom.Element {
    const components = path.join(path.basename(this.input), filePath).split(path.sep)
    const xPathComponents = components.map((c) => `*[@dirtree:name="${c}"]`)
    const query = '/' + xPathComponents.join('/')
    const node = evaluateXPathToFirstNode(query, this.xtree, null, this.xQueryVariables, xQueryOptions)
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
        fs.emptyDirSync(outputPath)
        elem.children.filter(child => child.tagName !== 'directory').forEach(
          child => {
            const file = child.getAttributeNS(dirtree, 'path') as string
            const match = Expander.templateRegex.exec(file)
            let queue = 0
            if (match && match[1] !== undefined) {
              queue = parseInt(match[1])
            }
            debug(`adding '${file}' to queue ${queue}`)
            if (elemQueues[queue] === undefined) {
              elemQueues[queue] = []
            }
            elemQueues[queue].push(child)
          }
        )
        elem.children.filter(child => child.tagName === 'directory').forEach(expandElement)
      }
    }
    expandElement(this.index(buildPath))
    const elemQueue = elemQueues.flat()
    for (const elem of elemQueue) {
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      const fullyExpandElement = (elem: slimdom.Element): slimdom.Element => {
        debug(`Evaluating ${elem.getAttributeNS(dirtree, 'path')}`)
        let res = elem
        const maxIterations = 8
        for (let output = elem.outerHTML, i = 0; i < maxIterations; i += 1) {
          try {
            res = evaluateXPathToFirstNode(output, elem, null, this.xQueryVariables, xQueryOptions) as slimdom.Element
          } catch (error) {
            throw new Error(`error expanding '${obj}': ${error}`)
          }
          if (output === res.outerHTML) {
            return res
          }
          output = res.outerHTML
        }
        throw new Error(`error expanding '${obj}': did not terminate after ${maxIterations} expansions`)
      }
      const outputPath = path.join(outputDir, stripPathPrefix(obj, buildPath))
        .replace(Expander.templateRegex, '')
      this.xQueryVariables.path = path.dirname(obj)
      this.xQueryVariables.element = elem
      if (Expander.templateRegex.exec(obj)) {
        debug(`Writing expansion of ${obj} to ${outputPath}`)
        const expandedElem = fullyExpandElement(elem)
        elem.replaceWith(expandedElem)
        fs.writeFileSync(outputPath, expandedElem.innerHTML)
      } else if (!Expander.noCopyRegex.exec(obj)) {
        const objFullPath = path.join(this.input, obj)
        fs.copyFileSync(objFullPath, outputPath)
      }
    }
  }
}

export default Expander
