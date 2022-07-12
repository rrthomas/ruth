import slimdom from 'slimdom'
import {evaluateXPath, evaluateXPathToString, XMLSerializer} from 'fontoxpath'

const fontoxpath = 'http://fontoxml.com/fontoxpath'
const URI_BY_PREFIX: {[key: string]: string} = {fontoxpath}

const elem = new slimdom.Document()

const res = evaluateXPathToString(
  // 'fontoxpath:evaluate(serialize(<foo></foo>), map{".": .})',
  'fontoxpath:evaluate("<foo></foo>", map{".": .})',
  elem,
  null,
  null,
  {
    language: evaluateXPath.XQUERY_3_1_LANGUAGE,
    namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
    xmlSerializer: new slimdom.XMLSerializer() as XMLSerializer,
    debug: true,
  },
)
console.log(res)
