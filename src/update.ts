import {evaluateUpdatingExpressionSync, executePendingUpdateList, registerXQueryModule} from 'fontoxpath'
import slimdom from 'slimdom'

registerXQueryModule(`
module namespace my-custom-namespace = "my-custom-uri";
(:~ Insert attribute somewhere ~:)
declare %public %updating function my-custom-namespace:foo($ele as node()) as node() {
  copy $a := $ele
  modify replace value of node $a/@foo with "bar"
  return $a
};
declare %public %updating function my-custom-namespace:do-something($elems as node()*) as node()* {
  for $ele in $elems
  return my-custom-namespace:foo($ele)
};
`)
// At some point:
const doc = new slimdom.Document()
const top = doc.createElement('top')
const elem = doc.createElement('element')
const elem2 = doc.createElement('element')
elem.setAttribute('foo', 'foo')
elem2.setAttribute('foo', 'foo')
top.appendChild(elem)
top.appendChild(elem2)
doc.appendChild(top)
const contextNode = doc.firstChild
const pendingUpdatesAndXdmValue = evaluateUpdatingExpressionSync(
  'ns:do-something(//element)',
  contextNode,
  null,
  null,
  {moduleImports: {ns: 'my-custom-uri'}, debug: true},
)

for (const node of pendingUpdatesAndXdmValue.xdmValue) {
  console.log(slimdom.serializeToWellFormedString(node))
}

executePendingUpdateList(pendingUpdatesAndXdmValue.pendingUpdateList);
