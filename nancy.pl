#!/usr/bin/perl
my $version = <<'END';
nancy $Revision$ ($Date$)
(c) 2002-2009 Reuben Thomas (rrt@sc3d.org; http://rrt.sc3d.org/)
Distributed under the GNU General Public License version 3, or (at
your option) any later version. There is no warranty.
END

use strict;
use warnings;

use File::Basename;
use File::Spec::Functions qw(catfile splitdir);
use Getopt::Long;

use File::Slurp qw(slurp);

use WWW::Nancy;

# Get arguments
my ($version_flag, $help_flag, $list_files_flag, $warn_flag);
my $prog = basename($0);
my $opts = GetOptions(
  "list-files" => \$list_files_flag,
  "warn" => \$warn_flag,
  "version" => \$version_flag,
  "help" => \$help_flag,
 );
die $version if $version_flag;
dieWithUsage() if !$opts || $#ARGV < 2 || $#ARGV > 3;

sub dieWithUsage {
  die <<END;
Usage: $prog SOURCE DESTINATION TEMPLATE [BRANCH]
The lazy web site maker

  --list-files, -l  list files read (on standard error)
  --warn, -w        warn about possible problems
  --version, -v     show program version
  --help, -h, -?    show this help

  SOURCE is the source directory tree
  DESTINATION is the directory to which the output is written
  TEMPLATE is the name of the template fragment
  BRANCH is the sub-directory of each SOURCE tree to process
    (defaults to the entire tree)
END
}

# FIXME: Use a module to add the boilerplate to the messages
sub Die {
  my ($message) = @_;
  die "$prog: $message\n";
}

sub Warn {
  my ($message) = @_;
  warn "$prog: $message\n";
}

Die("No source tree given") unless $ARGV[0];
my $sourceRoot = $ARGV[0];
Die("`$sourceRoot' not found or is not a directory") unless -d $sourceRoot;
my $destRoot = $ARGV[1];
$destRoot =~ s|/+$||;
Die("`$destRoot' is not a directory") if -e $destRoot && !-d $destRoot;
my $template = $ARGV[2];
$sourceRoot = catfile($sourceRoot, $ARGV[3]) if $ARGV[3];
$sourceRoot =~ s|/+$||;

# Turn a directory into a list of subdirectories, with leaf and
# non-leaf directories marked as such, and read all the files.
# Report duplicate fragments one of which masks the other.
# FIXME: Separate directory tree traversal from tree building
sub find {
  my ($obj) = @_;
  if (-f $obj) {
    return slurp($obj);
  } elsif (-d $obj) {
    my %dir = ();
    opendir(DIR, $obj);
    my @files = readdir(DIR);
    for my $file (@files) {
      next if $file eq "." or $file eq "..";
      $dir{$file} = find(catfile($obj, $file));
    }
    return \%dir;
  }
}

# Process source directories
my $sourceTree = find($sourceRoot);

# FIXME: The code below up to but not including write_pages should be
# in Nancy.pm.

sub fragment_tree_to_empty_map {
  my ($in_tree) = @_;
  if (ref($in_tree)) {
    my $out_tree = {};
    foreach my $node (keys %{$in_tree}) {
      $out_tree->{$node} = fragment_tree_to_empty_map($in_tree->{$node});
    }
    return $out_tree;
  } else {
    return;
  }
}

# Fragment to page tree
my $fragment_to_page = fragment_tree_to_empty_map($sourceTree);

# Walk tree, generating pages
sub generate {
  my ($name, $tree) = @_;
  return unless ref($tree);
  my $type = "leaf";
  foreach my $sub_name (keys %{$tree}) {
    $type = "node" if ref($tree->{$sub_name});
  }
  if ($type eq "node") {
    my %dir = ();
    foreach my $sub_name (keys %{$tree}) {
      my $res = generate(catfile($name || (), $sub_name), $tree->{$sub_name});
      $dir{$sub_name} = $res if defined($res);
    }
    return \%dir;
  } else {
    print STDERR "$name:\n" if $list_files_flag;
    my $out = WWW::Nancy::expand("\$include{$template}", $sourceRoot, $name, $sourceTree, $fragment_to_page, $warn_flag, $list_files_flag);
    print STDERR "\n" if $list_files_flag;
    return $out;
  }
}

my $pages = generate(undef, $sourceTree);


# Analyze generated pages to print warnings if desired
if ($warn_flag) {
  # Check fragments all of whose uses have a common prefix that the
  # fragment does not share.

  # Return the path made up of the first n components of p
  sub subPath {
    my ($p, $n) = @_;
    my @path = splitdir($p);
    return catfile(@path[0 .. $n - 1]);
  }

  sub check_misplaced {
    my ($name, $tree) = @_;
    if (UNIVERSAL::isa($tree, "HASH")) {
      foreach my $sub_name (keys %{$tree}) {
        check_misplaced(catfile($name || (), $sub_name), $tree->{$sub_name});
      }
    } else {
      my $prefix_len = scalar(splitdir(@{$tree}[0]));
      foreach my $page (@{$tree}) {
        for (;
             $prefix_len > 0 &&
               subPath($page, $prefix_len) ne
                 subPath(@{$tree}[0], $prefix_len);
               $prefix_len--)
          {}
      }
      Warn "$name could be moved into " . subPath(@{$tree}[0], $prefix_len)
        if scalar(splitdir(dirname($name))) < $prefix_len &&
          subPath(@{$tree}[0], $prefix_len) ne subPath(dirname($name), $prefix_len);
    }
  }
  check_misplaced(undef, $fragment_to_page);

  # Check for unused fragments
  sub check_unused {
    my ($name, $tree) = @_;
    if (UNIVERSAL::isa($tree, "HASH")) {
      foreach my $sub_name (keys %{$tree}) {
        check_unused(catfile($name || (), $sub_name), $tree->{$sub_name});
      }
    } elsif ($#$tree == -1) {
      Warn "$name is unused";
    }
  }
  check_unused(undef, $fragment_to_page);
}


# Write pages to disk
sub write_pages {
  my ($name, $tree) = @_;
  if (ref($tree)) {
    mkdir catfile($destRoot, $name);
    foreach my $sub_name (keys %{$tree}) {
      write_pages(catfile($name || (), $sub_name), $tree->{$sub_name});
    }
  } else {
    open OUT, ">" . catfile($destRoot, $name) or Warn("Could not write to `$name'");
    print OUT $tree;
    close OUT;
  }
}

write_pages(undef, $pages);
