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

  expand(output: string, buildPath = ''): void {
    const expandElement = (elem: slimdom.Element): void => {
      const obj = elem.getAttributeNS(dirtree, 'path') as string
      this.xQueryVariables.path = path.dirname(obj)
      this.xQueryVariables.element = elem
      const fullyExpandNode = (elem: slimdom.Element): slimdom.Element => {
        let res
        for (let output = elem.outerHTML; ; output = res.outerHTML) {
          try {
            res = evaluateXPathToFirstNode(output, elem, null, this.xQueryVariables, xQueryOptions) as slimdom.Element
          } catch (error) {
            throw new Error(`error expanding '${obj}': ${error}`)
          }
          if (output === res.outerHTML) {
            return res
          }
        }
      }
      const outputPath = path.join(output, stripPathPrefix(obj, buildPath))
        .replace(Expander.templateRegex, '.')
      const objFullPath = path.join(this.input, obj)
      if (elem.namespaceURI === dirtree && elem.localName === 'directory') {
        fs.emptyDirSync(outputPath)
        elem.children.filter(child => child.tagName === 'directory').forEach(expandElement)
        elem.children.filter(child => child.tagName !== 'directory').forEach(expandElement)
      } else {
        if (Expander.templateRegex.exec(obj)) {
          debug(`Writing expansion of ${obj} to ${outputPath}`)
          const elem = this.index(obj)
          fs.writeFileSync(outputPath, fullyExpandNode(elem).innerHTML)
        } else if (!Expander.noCopyRegex.exec(obj)) {
          fs.copyFileSync(objFullPath, outputPath)
        }
      }
    }

    expandElement(this.index(buildPath))
  }
}

export default Expander
