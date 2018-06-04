#!/bin/bash -e

usage()
{
	echo "Usage: ./luacheck.sh path/to/dfhack" >&2
	exit 1
}

if [[ "$#" -ne 1 ]] || [[ ! -d "$1" ]]; then
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

cp -f "$dfhack_dir/library/include/df/codegen.out.xml" "codegen_$dfhack_version.out.xml"
ln -sf builtins_base.js "builtins_$dfhack_version.js"
node prepare.js "$dfhack_version" > /dev/null

echo "Prepared df-luacheck for DFHack $dfhack_version."

had_error=0

rm -f "$dfhack_dir/library/lua/plugins"
ln -sf ../../plugins/lua "$dfhack_dir/library/lua/plugins"
find "$dfhack_dir/scripts" -name '*.lua' -print0 | while IFS= read -r -d $'\0' script_path; do
	node index.js -v "$dfhack_version" -S "$dfhack_dir/scripts" -I "$dfhack_dir/library/lua" -I "$dfhack_dir/scripts" -p dfhack "$script_path" || had_error=1
done
rm -f "$dfhack_dir/library/lua/plugins"

if [[ "$had_error" -ne 0 ]]; then
	exit 2
fi
