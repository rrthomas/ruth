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

export function replacePathPrefix(s: string, prefix: string, newPrefix = ''): string {
  if (s.startsWith(prefix + path.sep)) {
    return path.join(newPrefix, s.slice(prefix.length + path.sep.length))
  } else if (s === prefix) {
    return newPrefix
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

  // FIXME: arguments except input should be arguments to expand()
  constructor(
    private input: string,
    private output: string,
    private buildPath = '',
    private abortOnError = false,
    private inputFs: IFS = realFs,
  ) {
    this.absInput = path.resolve(input)
    this.xtree = this.dirTreeToXML(input)
  }

  private static templateRegex = /\.ruth\.(?=\.[^.]+$)?/
  private static noCopyRegex = /\.in(?=\.[^.]+$)?/

  isExecutable(file: string): boolean {
    try {
      this.inputFs.accessSync(file, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private expandPath(obj: string): void {
    const fullyExpandNode = (elem: slimdom.Element): string => {
      let res
      for (let output = elem.outerHTML; ; output = res.outerHTML) {
        res = evaluateXPathToFirstNode(output, elem, null, null, xQueryOptions) as slimdom.Element
        if (res === null) {
          throw new Error(`Evaluating '${obj}' produced no result`)
        }
        if (output === res.outerHTML) {
          return res.innerHTML
        }
      }
    }
    const outputPath = replacePathPrefix(obj, path.join(this.input, this.buildPath), this.output)
      .replace(Expander.templateRegex, '.')
    const stats = this.inputFs.statSync(obj)
    if (stats.isDirectory()) {
      fs.emptyDirSync(outputPath)
      const dir = this.inputFs.readdirSync(obj, {withFileTypes: true})
        .filter(dirent => dirent.name[0] !== '.')
      const dirs = dir.filter(dirent => dirent.isDirectory())
      const files = dir.filter(dirent => !dirent.isDirectory())
      dirs.forEach((dirent) => this.expandPath(path.join(obj, dirent.name)))
      files.forEach((dirent) => this.expandPath(path.join(obj, dirent.name)))
    } else {
      if (Expander.templateRegex.exec(obj)) {
        debug(`Writing expansion of ${obj} to ${outputPath}`)
        const index = (filePath: string) => {
          const components = replacePathPrefix(filePath, path.dirname(this.input)).split(path.sep)
          const xPathComponents = components.map((c) => `*[@dirtree:name="${c}"]`)
          const query = '/' + xPathComponents.join('/')
          return evaluateXPathToFirstNode(query, this.xtree, null, null, xQueryOptions)
        }
        const elem = index(obj) as slimdom.Element
        if (elem === null) {
          throw new Error(`path '${obj}' does not exist in the expanded tree`)
        }
        fs.writeFileSync(outputPath, fullyExpandNode(elem))
      } else if (!Expander.noCopyRegex.exec(obj)) {
        fs.copyFileSync(obj, outputPath)
      }
    }
  }

  private dirTreeToXML(root: string) {
    const xtree = new slimdom.Document()
    const objToNode = (obj: string) => {
      const stats = this.inputFs.statSync(obj)
      const parsedPath = path.parse(obj)
      const basename = (/^[^.]*/.exec(parsedPath.name) as string[])[0]
      let elem: slimdom.Element
      if (stats.isDirectory()) {
        elem = xtree.createElementNS(dirtree, 'directory')
        elem.setAttributeNS(dirtree, 'type', 'directory')
        const dir = this.inputFs.readdirSync(obj, {withFileTypes: true})
          .filter(dirent => dirent.name[0] !== '.')
        const dirs = dir.filter(dirent => dirent.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
        const files = dir.filter(dirent => !(dirent.isDirectory())).sort((a, b) => a.name.localeCompare(b.name))
        dirs.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
        files.forEach((dirent) => elem.appendChild(objToNode(path.join(obj, dirent.name))))
      } else if (stats.isFile()) {
        if (this.isExecutable(obj)) {
          registerCustomXPathFunction(
            {localName: basename.replace(Expander.noCopyRegex, ''), namespaceURI: ruth},
            // FIXME: 'array(xs:string)' unsupported: https://github.com/FontoXML/fontoxpath/issues/360
            ['array(*)'], 'xs:string',
            (_, args: string[]): string => {
              try {
                return execa.sync(path.join(this.absInput, replacePathPrefix(obj, this.input)), args).stdout
              } catch (error) {
                if (this.abortOnError) {
                  throw error
                }
                return `${error}`
              }
            },
          )
          elem = xtree.createElementNS(dirtree, 'executable')
        } else if (['.xml', '.xhtml'].includes(parsedPath.ext)) {
          const text = this.inputFs.readFileSync(obj, 'utf-8')
          const wrappedText = `<${basename}>${text}</${basename}>`
          const doc = parseXML(wrappedText, {additionalNamespaces: URI_BY_PREFIX})
          assert(doc.documentElement !== null)
          elem = doc.documentElement
        } else {
          if (/.xq[lmy]?/.test(parsedPath.ext)) {
            registerXQueryModule(this.inputFs.readFileSync(obj, 'utf-8'));
            // FIXME: Parse namespace declaration in module?
            xQueryOptions.moduleImports = {ruth}
          }
          elem = xtree.createElementNS(dirtree, 'file')
        }
        elem.setAttributeNS(dirtree, 'type', 'file')
      } else {
        elem = xtree.createElement('unknown')
      }
      elem.setAttributeNS(dirtree, 'path', obj)
      elem.setAttributeNS(dirtree, 'name', parsedPath.base)
      return elem
    }
    const rootElem = objToNode(root)
    xtree.appendChild(rootElem)
    debug('Input XML')
    debug(formatXML(rootElem.outerHTML))
    return xtree
  }

  expand(): void {
    const obj = path.join(this.input, this.buildPath)
    if (!this.inputFs.existsSync(obj)) {
      throw new Error(`path '${this.buildPath}' does not exist in '${this.input}'`)
    }
    this.expandPath(obj)
  }
}

export default Expander
