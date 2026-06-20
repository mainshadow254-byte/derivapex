// Bot import validator. Imported bots MUST pass validation before they can run.
// Supports Deriv-style XML bot files (blockly) and JSON strategy descriptors.
// This is a safety gate — it rejects malformed/oversized/unsafe definitions.

const MAX_BYTES = 512 * 1024; // 512KB cap
const ALLOWED_CONTRACT_TYPES = ['CALL', 'PUT', 'BOTH', 'DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

export function validateBot({ filename, content }) {
  const errors = [];
  const warnings = [];

  if (!content || typeof content !== 'string') {
    return { valid: false, errors: ['Empty or unreadable bot file.'], warnings, meta: {} };
  }
  if (content.length > MAX_BYTES) {
    errors.push(`Bot file too large (max ${MAX_BYTES / 1024}KB).`);
  }

  const isXml = /\.xml$/i.test(filename || '') || content.trimStart().startsWith('<');
  const isJson = /\.json$/i.test(filename || '') || content.trimStart().startsWith('{');

  // Block embedded scripts / network calls — imported bots must be declarative.
  const danger = [/<script/i, /eval\s*\(/i, /https?:\/\//i, /fetch\s*\(/i, /XMLHttpRequest/i, /import\s+/i];
  for (const re of danger) {
    if (re.test(content)) errors.push(`Disallowed content detected (${re}). Bots must be declarative, no external calls or code execution.`);
  }

  const meta = { format: isXml ? 'xml' : isJson ? 'json' : 'unknown' };

  if (isXml) {
    if (!/<xml/i.test(content) && !/<block/i.test(content)) {
      errors.push('XML does not look like a valid Deriv/Blockly bot (no <xml>/<block>).');
    }
    const symbolMatch = content.match(/symbol["'>\s:]+([A-Za-z0-9_]+)/);
    if (symbolMatch) meta.symbol = symbolMatch[1];
    if (!/trade|purchase|contract/i.test(content)) {
      warnings.push('No obvious trade/purchase block found — verify the strategy is complete.');
    }
  } else if (isJson) {
    let obj;
    try { obj = JSON.parse(content); } catch { errors.push('Invalid JSON.'); }
    if (obj) {
      if (!obj.symbol) errors.push('JSON bot missing "symbol".');
      if (!obj.contract_type) errors.push('JSON bot missing "contract_type".');
      if (obj.contract_type && !ALLOWED_CONTRACT_TYPES.includes(String(obj.contract_type).toUpperCase())) {
        errors.push(`Unsupported contract_type "${obj.contract_type}".`);
      }
      if (obj.stake != null && (typeof obj.stake !== 'number' || obj.stake <= 0)) {
        errors.push('Stake must be a positive number.');
      }
      meta.symbol = obj.symbol;
      meta.contract_type = obj.contract_type;
    }
  } else {
    errors.push('Unrecognized bot format. Upload a Deriv .xml bot or a .json strategy.');
  }

  return { valid: errors.length === 0, errors, warnings, meta };
}
