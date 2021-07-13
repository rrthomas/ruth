module namespace ruth = "https://github.com/rrthomas/ruth/raw/master/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/master/dirtree.dtd";
declare namespace html = "http://www.w3.org/1999/xhtml";

declare variable $path as xs:string external;
declare variable $elem external;

(: Join path segments :)
(: FIXME: take an array; join any number of segments :)
declare function ruth:path-join($path1 as xs:string, $path2 as xs:string) as xs:string {
  if ($path1 = '') then
    $path2
  else
    (if ($path2 = '') then
       $path1
     else
       concat($path1, '/', $path2))
};

(: Returns the path from $path to $path_from_root :)
declare %public function ruth:relative-path($path_from_root as xs:string) as xs:string {
  ruth:path-join(string-join((for $_ in 1 to count(tokenize($path, '/')) return '..'), '/'),
                 $path_from_root)
};

(: Like relative-path(), but for an element :)
declare function ruth:relative-path-to-elem($dest_elem) as xs:string {
  ruth:path-join(string-join((for $_ in 2 to count($elem/ancestor::dirtree:directory) return '..'), '/'),
                 $dest_elem/ancestor::dirtree:directory[1]/@dirtree:path)
};

(: Compute a breadcrumb trail to the given node :)
declare %public function ruth:breadcrumb($node) {
  <html:ul>
    {for $title in reverse($node/ancestor::dirtree:directory/*:title)
     return <html:li>
              <html:a href="{ruth:relative-path-to-elem($title)}/index/index.xhtml">{$title/node()}</html:a>
            </html:li>}
  </html:ul>
};
