module namespace ruth = "https://github.com/rrthomas/ruth/raw/master/ruth.dtd";
declare namespace dirtree = "https://github.com/rrthomas/ruth/raw/master/dirtree.dtd";

declare variable $path as xs:string external;
declare variable $element external;
declare function ruth:eval($query as xs:string) as node() external;

(:~
 : Include a file from the Ruth XML document at the call-site
 :
 : @param   $file the basename of the file to include
 :)
declare function ruth:include($file as xs:string) as node()
  {ruth:eval('(ancestor::dirtree:directory/' || $file || ')[1]/node()')
};

(:~
 : Insert the contents of the first node of the given name in a file at or
 : above the current directory. Used to copy from literal data that does not
 : itself contain queries; it can insert a value from a file in the same
 : directory as the caller.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:query($datum as xs:string) as node()
  {ruth:eval('(ancestor::dirtree:directory/*/' || $datum || ')[1]/node()')
};

(:~
 : Insert the contents of the first node of the given name in a file above
 : the current directory. Typically used to specialize data that may contain
 : further XQuery calls; starting at the parent level avoids loops.
 :
 : @param   $datum the name of the node whose contents should be included
 :)
declare function ruth:data($datum as xs:string) as node()
  {ruth:eval('(parent::*/ancestor::dirtree:directory/*/' || $datum ||
  ')[1]/node()')
};

(:~
 : Join the given path segments
 :)
declare function ruth:path-join($components as xs:string*) as xs:string {
  string-join(
    for $component in $components
      where $component != ''
      return $component,
    '/'
  )
};

(: Returns the path from $path to $path_from_root :)
declare function ruth:relative-path($path_from_root as xs:string) as xs:string {
  ruth:path-join((for $_ in 1 to count(tokenize($path, '/')) return '..',
                 $path_from_root))
};

(: Like relative-path(), but for an element :)
declare function ruth:relative-path-to-elem($dest_elem as element()) as xs:string {
  ruth:path-join((for $_ in 2 to count($element/ancestor::dirtree:directory) return '..',
                 $dest_elem/ancestor::dirtree:directory[1]/@dirtree:path))
};
