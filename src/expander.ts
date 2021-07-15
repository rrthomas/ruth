import fs from 'fs-extra'
import path from 'path'
import Debug from 'debug'
import assert from 'assert'
import realFs from 'fs'
import {IFS} from 'unionfs/lib/fs'
import slimdom from 'slimdom'
import {sync as parseXML} from 'slimdom-sax-parser'
import formatXML from 'xml-formatter'
import {
  evaluateXPath, evaluateXPathToFirstNode, Options, registerXQueryModule,
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
    private inputFs: IFS = realFs,
  ) {
    this.absInput = path.resolve(input)
    this.xtree = this.dirTreeToXML(input)
  }

  private static templateRegex = /\.ruth\.(?=\.[^.]+$)?/
  private static noCopyRegex = /\.in(?=\.[^.]+$)?/

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
        if (['.xml', '.xhtml'].includes(parsedPath.ext)) {
          debug(`reading as XML`)
          const text = this.inputFs.readFileSync(obj, 'utf-8')
          const wrappedText = `<${basename}>${text}</${basename}>`
          const doc = parseXML(wrappedText, {additionalNamespaces: URI_BY_PREFIX})
          assert(doc.documentElement !== null)
          elem = doc.documentElement
        } else {
          debug(`not reading as XML`)
          if (/.xq[lmy]?/.test(parsedPath.ext)) {
            debug(`reading as XQuery module`)
            registerXQueryModule(this.inputFs.readFileSync(obj, 'utf-8'));
            // FIXME: Parse namespace declaration in module.
            xQueryOptions.moduleImports = {ruth}
          }
          elem = xtree.createElementNS(dirtree, 'file')
        }
        elem.setAttributeNS(dirtree, 'type', 'file')
      } else {
        throw new Error(`'${obj}' is not a directory or file`)
      }
      elem.setAttributeNS(dirtree, 'path', replacePathPrefix(obj, this.input))
      elem.setAttributeNS(dirtree, 'name', parsedPath.base)
      return elem
    }
    const rootElem = objToNode(root)
    xtree.appendChild(rootElem)
    debug('Input XML')
    debug(formatXML(rootElem.outerHTML))
    return xtree
  }

  private expandPath(obj: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xQueryVariables: {[id: string]: any} = {
      // FIXME: Put these variables in ruth namespace.
      // See https://github.com/FontoXML/fontoxpath/issues/381
      root: this.input,
      path: replacePathPrefix(path.dirname(obj), this.input)
        .replace(Expander.templateRegex, '.'),
    }
    const index = (filePath: string): slimdom.Node | null => {
      const components = replacePathPrefix(filePath, path.dirname(this.input)).split(path.sep)
      const xPathComponents = components.map((c) => `*[@dirtree:name="${c}"]`)
      const query = '/' + xPathComponents.join('/')
      return evaluateXPathToFirstNode(query, this.xtree, null, xQueryVariables, xQueryOptions)
    }
    xQueryVariables['element'] = index(obj)
    const fullyExpandNode = (elem: slimdom.Element): string => {
      let res
      for (let output = elem.outerHTML; ; output = res.outerHTML) {
        res = evaluateXPathToFirstNode(output, elem, null, xQueryVariables, xQueryOptions) as slimdom.Element
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
        const elem = index(obj) as slimdom.Element
        if (elem === null) {
          throw new Error(`path '${obj}' does not exist in the input`)
        }
        fs.writeFileSync(outputPath, fullyExpandNode(elem))
      } else if (!Expander.noCopyRegex.exec(obj)) {
        fs.copyFileSync(obj, outputPath)
      }
    }
  }

  expand(): void {
    this.expandPath(path.join(this.input, this.buildPath))
  }
}

export default Expander
