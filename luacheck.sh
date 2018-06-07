#!/bin/bash -e

luacheck_dir="$(dirname "$0")"

usage()
{
	echo "Usage: $luacheck_dir/luacheck.sh [--verbose] path/to/dfhack [paths/to/scripts.lua]" >&2
	exit 1
}

args=
if [[ "$1" == "-v" ]] || [[ "$1" == "--verbose" ]]; then
	args="$args --verbose"
	shift
fi

if [[ "$#" -lt 1 ]] || [[ ! -d "$1" ]]; then
	usage
fi

dfhack_dir=$1
shift

if [[ ! -r "$dfhack_dir/library/include/df/codegen.out.xml" ]]; then
	echo "Missing codegen.out.xml. Has DFHack been compiled?" >&2
	usage
fi

df_version=$(grep -Po '(?<=set\(DF_VERSION ").*(?="\))' "$dfhack_dir/CMakeLists.txt")
dfhack_release=$(grep -Po '(?<=set\(DFHACK_RELEASE ").*(?="\))' "$dfhack_dir/CMakeLists.txt")
dfhack_version=$df_version-$dfhack_release

cp -f "$dfhack_dir/library/include/df/codegen.out.xml" "$luacheck_dir/codegen_$dfhack_version.out.xml"
ln -sf builtins_base.js "$luacheck_dir/builtins_$dfhack_version.js"
node "$luacheck_dir/prepare.js" "$dfhack_version" > /dev/null

echo "Prepared df-luacheck for DFHack $dfhack_version."

had_error=0

rm -f "$dfhack_dir/library/lua/plugins"
ln -sf ../../plugins/lua "$dfhack_dir/library/lua/plugins"
if (( $# > 0 )); then
	while (( $# > 0 )); do
		node "$luacheck_dir/index.js" $args -v "$dfhack_version" -S "$dfhack_dir/scripts" -I "$dfhack_dir/library/lua" -I "$dfhack_dir/scripts" -p dfhack "$1" || had_error=1
		shift
	done
else
	find "$dfhack_dir/scripts" -name '*.lua' -print0 | while IFS= read -r -d $'\0' script_path; do
		node "$luacheck_dir/index.js" $args -v "$dfhack_version" -S "$dfhack_dir/scripts" -I "$dfhack_dir/library/lua" -I "$dfhack_dir/scripts" -p dfhack "$script_path" || had_error=1
	done
fi
rm -f "$dfhack_dir/library/lua/plugins"

if [[ "$had_error" -ne 0 ]]; then
	exit 2
fi
