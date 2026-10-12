// Tiny argv reader shared by this section's scripts: --name value | --name=value.
export function argument(name, argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return undefined;
}
