module namespace cookbook = "https://github.com/rrthomas/ruth/raw/main/test/cookbook-example-src/cookbook.dtd";
import module namespace ruth = "https://github.com/rrthomas/ruth/raw/main/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/main/dirtree.dtd";
declare namespace html = "http://www.w3.org/1999/xhtml";

(: Compute a breadcrumb trail to the given node :)
declare function cookbook:breadcrumb($context as element(), $node as node()) as node() {
  <html:ul>
    {for $title in reverse($node/ancestor::dirtree:directory/dirtree:file[@dirtree:name='title.in.xhtml'])
     return <html:li>
              <html:a href="{ruth:relative-path-to-element($context, $title)}/index/index.xhtml">{$title/node()}</html:a>
            </html:li>}
  </html:ul>
};
