# Nancy.pm $Revision: 982 $ ($Date: 2009-10-04 22:01:25 +0100 (Sun, 04 Oct 2009) $)
# (c) 2002-2009 Reuben Thomas (rrt@sc3d.org; http://rrt.sc3d.org/)
# Distributed under the GNU General Public License version 3, or (at
# your option) any later version. There is no warranty.

# FIXME: Write proper API documentation in POD

package WWW::Nancy;

use strict;
use warnings;

use File::Basename;
use File::Spec::Functions qw(catfile splitdir);


my ($warn_flag, $list_files_flag, $fragments, $fragment_to_page);


# Search for fragment starting at the given path; if found return
# its name and contents; if not, print a warning and return undef.
sub findFragment {
  my ($path, $fragment) = @_;
  my @search = splitdir($path);
  my ($name, $contents, @cur_path, @used_path, $node);
  for (my $tree = $fragments; ref($tree); $tree = $tree->{$node}) {
    $node = shift @search;
    if (defined($tree->{$fragment}) && !ref($tree->{$fragment})) { # We have a fragment, not a directory
      my $new_name = catfile(@cur_path, $fragment);
      $name = $new_name;
      print STDERR "  $name\n" if $list_files_flag;
      warn("$new_name is identical to $name") if $warn_flag && defined($contents) && $contents eq $tree->{$fragment};
      $contents = $tree->{$fragment};
      @used_path = @cur_path;
    }
    push @cur_path, $node if defined($node);
    last if !defined($node);
  }
  warn("Cannot find `$fragment' while building `$path'\n") unless $contents;
  for (my $useTree = $fragment_to_page; ref($useTree); $useTree = $useTree->{$node}) {
    $node = shift @used_path;
    if (!defined($node)) {
      push @{$useTree->{$fragment}}, $path;
      last;
    }
  }
  return $name, $contents;
}

# Process a command; if the command is undefined, replace it, uppercased
sub doMacro {
  my ($macro, $arg, %macros) = @_;
  if (defined($macros{$macro})) {
    my @arg = split /(?<!\\),/, ($arg || "");
    return $macros{$macro}(@arg);
  } else {
    $macro =~ s/^(.)/\u$1/;
    return "\$$macro\{$arg}";
  }
}

# Process commands in some text
sub doMacros {
  my ($text, %macros) = @_;
  1 while $text =~ s/\$([[:lower:]]+){(((?:(?!(?<!\\)[{}])).)*?)(?<!\\)}/doMacro($1, $2, %macros)/ge;
  return $text;
}

# Expand commands in some text
#   $text - text to expand
#   $tree - source tree path
#   $page - leaf directory to make into a page
#   $fragments - tree of fragments
#   $fragment_to_page - tree of fragment to page maps
#   $warn_flag - whether to output warnings
#   $list_files_flag - whether to output fragment lists
# returns expanded text, fragment to page tree
sub expand {
  my ($text, $tree, $page);
  ($text, $tree, $page, $fragments, $fragment_to_page, $warn_flag, $list_files_flag) = @_;
  my %macros = (
    page => sub {
      # Split and join needed for platforms whose path separator is not "/"
      my @url = splitdir($page);
      return join "/", @url;
    },
    root => sub {
      my $reps = scalar(splitdir($page)) - 1;
      return join "/", (("..") x $reps) if $reps > 0;
      return ".";
    },
    include => sub {
      my ($fragment) = @_;
      my ($name, $contents) = findFragment($page, $fragment);
      my $text = "";
      if ($name) {
        $text .= "***INCLUDE: $name***" if $list_files_flag;
        $text .= $contents;
      }
      return $text;
    },
    run => sub {
      my ($prog) = @_;
      my ($name, $contents) = findFragment($page, $prog);
      if ($name) {
        my $sub = eval($contents);
        return &{$sub}(@_);
      }
      return "";
    },
  );
  $text = doMacros($text, %macros);
  # Convert $Macro back to $macro
  $text =~ s/(?!<\\)(?<=\$)([[:upper:]])(?=[[:lower:]]*{)/lc($1)/ge;
  return $text;
}

return 1;
