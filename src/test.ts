import {evaluateXPathToString, registerCustomXPathFunction} from 'fontoxpath'

const foo = 'http://www.example.com/foo'
const URI_BY_PREFIX: {[key: string]: string} = {foo}

registerCustomXPathFunction(
  {localName: 'test', namespaceURI: foo},
  ['function(*)'], 'xs:string',
  (_, fn: (s: string) => string) => {
    console.log(`foo:test(${fn})`)
    const res: any = fn('abc')
    console.log(res.value.next().value.value)
    return res
  },
)
const res = evaluateXPathToString(
  'foo:test(function ($s as xs:string) as xs:string { $s })',
  null,
  null,
  null,
  {
    namespaceResolver: (prefix: string) => URI_BY_PREFIX[prefix],
    debug: true,
  },
)
console.log(res)
