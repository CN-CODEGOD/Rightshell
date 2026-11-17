const crypto = require('crypto');

function uid() {
  return crypto.randomUUID();
}

function expandEnv(str) {
  if (!str) return str;
  return String(str).replace(/%([^%]+)%/g, (m, name) => {
    const v = process.env[name] ?? process.env[name.toUpperCase()];
    return v === undefined ? m : v;
  });
}

// Split a profile commandline into [exe, ...args], honoring double quotes.
function parseCommandline(commandline) {
  const expanded = expandEnv(commandline).trim();
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(expanded)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  if (!tokens.length) return null;
  return { file: tokens[0], args: tokens.slice(1) };
}

module.exports = { uid, expandEnv, parseCommandline };