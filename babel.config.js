const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;

    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

function inlineSystemCallEnv({types: t}) {
  const value = process.env.SYSTEMCALL_API_BASE_URL ?? '';

  return {
    name: 'inline-systemcall-env',
    visitor: {
      MemberExpression(memberPath) {
        const node = memberPath.node;
        if (
          node.object?.type === 'MemberExpression' &&
          node.object.object?.type === 'Identifier' &&
          node.object.object.name === 'process' &&
          node.object.property?.type === 'Identifier' &&
          node.object.property.name === 'env' &&
          node.property?.type === 'Identifier' &&
          node.property.name === 'SYSTEMCALL_API_BASE_URL'
        ) {
          memberPath.replaceWith(t.stringLiteral(value));
        }
      },
    },
  };
}

loadEnvFile();

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineSystemCallEnv],
};
