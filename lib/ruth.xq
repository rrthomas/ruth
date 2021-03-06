module namespace ruth = "https://github.com/rrthomas/ruth/raw/main/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/main/dirtree.dtd";

(:~
 : FIXME: Namespace the variables; see https://github.com/FontoXML/fontoxpath/issues/381
 :)
declare variable $ruth_path as xs:string external;
declare variable $ruth_element external;

declare function ruth:eval($query as xs:string) as node()* external;
declare function ruth:map($query as xs:string, $fn as function(*), $nodes as node()*) as node()* external;

declare function ruth:eval-items($item as item()*) as item()* {
  typeswitch($item)
  case text() return $item
  default return ruth:eval(serialize($item[1]))/node()
};

(:~
 : Return the the absolute path to $path
 :
 : @param   $path a path relative to the input tree
 :)
declare function ruth:real-path($path as xs:string) as xs:string external;

(:~
 : Include a file from the Ruth XML document at the call-site
 :
 : @param   $file the basename of the file to include
 :)
declare function ruth:include($file as xs:string) as node()* {
  let $res := ruth:eval('ancestor::dirtree:directory/dirtree:file[@dirtree:name="' || $file || '"]')
  return ruth:eval-items($res)
};

(:~
 : Insert the contents of the first node of the given name in a file at or
 : above the current directory. Used to copy from literal data that does not
 : itself contain queries; it can insert a value from a file in the same
 : directory as the caller.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:query($datum as xs:string) as node()* {
  let $res := ruth:eval('ancestor::*/*/' || $datum)
  return if (empty($res))
         then error(xs:QName('ruth:QueryNoResults'), "ruth:query: '" || $datum || "' gives no results")
         else ruth:eval-items($res)
};

(:~
 : Insert the contents of the first node of the given name in a file above
 : the current directory. Typically used to specialize data that may contain
 : further XQuery calls; starting at the parent level avoids loops.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:data($datum as xs:string) as node()* {
  let $res := ruth:eval('parent::*/ancestor::*/*/' || $datum)
  return if (empty($res))
         then error(xs:QName('ruth:DataNoResults'), "ruth:data: '" || $datum || "' gives no results")
         else ruth:eval-items($res)
};

(:~
 : Join the given path components into a path string
 :
 : @param   $components the path components
 :)
declare function ruth:path-join($components as xs:string*) as xs:string {
  string-join(
    for $component in $components
      where $component != ''
      return $component,
    '/'
  )
};

(:~
 : Return the relative path from $ruth_path to $path
 :
 : @param   $path a path relative to the input tree
 :)
declare function ruth:relative-path($path as xs:string) as xs:string {
  ruth:path-join((for $_ in 1 to count(tokenize($ruth_path, '/')) return '..', $path))
};

(:~
 : Return the path from the root of the input tree to $path
 :
 : @param   $path a path relative to $ruth_path
 :)
declare function ruth:root-relative-path($path as xs:string) as xs:string {
  string-join(($ruth_path, $path), '/')
};

(:~
 : Return the relative path from $ruth_element to $element
 :
 : @param   $element the path to an element
 :)
declare function ruth:relative-path-to-element($elem as element()) as xs:string {
  ruth:path-join((for $_ in 2 to count($ruth_element/ancestor::dirtree:directory) return '..',
                 $elem/ancestor::dirtree:directory[1]/@dirtree:path))
};
