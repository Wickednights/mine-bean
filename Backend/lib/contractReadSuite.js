/**
 * ABI-driven static calls: runs every view/pure function on a Contract instance.
 * Uses heuristics for arguments (roundId, user address, pagination). Mis-inferred
 * calls may revert — those are recorded as errors in the suite output.
 */

const { ethers } = require('ethers');

function serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'function') return '[function]';
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) {
    try {
      return value.map((v) => serialize(v));
    } catch {
      return '[array serialize error]';
    }
  }
  if (typeof value === 'object') {
    if (value.toJSON && typeof value.toJSON === 'function') {
      try {
        return serialize(value.toJSON());
      } catch {
        /* fall through */
      }
    }
    if (value != null && typeof value.length === 'number' && typeof value.getUint === 'function') {
      try {
        return serialize(Array.from(value));
      } catch {
        /* fall through */
      }
    }
    const out = {};
    for (const k of Object.keys(value)) {
      try {
        out[k] = serialize(value[k]);
      } catch {
        out[k] = '[Error]';
      }
    }
    return out;
  }
  return String(value);
}

function isUintLike(t) {
  return typeof t === 'string' && (t.startsWith('uint') || t.startsWith('int'));
}

/**
 * @param {import('ethers').FunctionFragment} frag
 * @param {{ userAddress: string, roundId: number, prevRoundId: number }} ctx
 */
function inferArgs(frag, ctx) {
  const inputs = frag.inputs;
  const user = ctx.userAddress || ethers.ZeroAddress;
  const r = BigInt(ctx.roundId);
  const pr = BigInt(ctx.prevRoundId);

  if (inputs.length === 2 && isUintLike(inputs[0].type) && isUintLike(inputs[1].type) && !inputs[0].name && !inputs[1].name) {
    return [0n, 100n];
  }

  const out = [];
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    const t = inp.type;
    const n = (inp.name || '').toLowerCase();

    if (t === 'address' || t.startsWith('contract')) {
      out.push(user);
      continue;
    }

    if (t === 'bool') {
      out.push(false);
      continue;
    }

    if (isUintLike(t)) {
      if (n.includes('round')) {
        out.push(n.includes('prev') || n.includes('last') ? pr : r);
        continue;
      }
      if (n.includes('block') || n === 'blockid' || n === 'idx') {
        out.push(0n);
        continue;
      }
      if (n === 'offset' || n === 'start' || n === 'from' || n === 'skip') {
        out.push(0n);
        continue;
      }
      if (n === 'limit' || n === 'count' || n === 'length' || n === 'size') {
        out.push(100n);
        continue;
      }
      if (i === 0 && i + 1 < inputs.length && (inputs[i + 1].type === 'address' || inputs[i + 1].type.startsWith('contract'))) {
        out.push(r);
        continue;
      }
      if (i === 1 && inputs[0].type === 'address') {
        out.push(0n);
        continue;
      }
      out.push(0n);
      continue;
    }

    if (typeof t === 'string' && t.startsWith('bytes')) {
      out.push(t === 'bytes32' ? ethers.ZeroHash : '0x');
      continue;
    }

    out.push(null);
  }
  return out;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * @param {string} contractLabel
 * @param {import('ethers').Contract} contract
 * @param {{ userAddress: string | null, roundId: number, prevRoundId: number }} ctx
 */
async function runReadSuite(contractLabel, contract, ctx) {
  const iface = contract.interface;
  const userAddress = ctx.userAddress ? ethers.getAddress(ctx.userAddress) : ethers.ZeroAddress;
  const innerCtx = {
    userAddress,
    roundId: Math.max(1, Number(ctx.roundId) || 1),
    prevRoundId: Math.max(1, Number(ctx.prevRoundId) || 1),
  };

  /** @type {import('ethers').FunctionFragment[]} */
  const fragments = [];
  for (const frag of iface.fragments) {
    if (frag.type !== 'function') continue;
    if (frag.stateMutability !== 'view' && frag.stateMutability !== 'pure') continue;
    fragments.push(frag);
  }

  const tasks = fragments.map((frag) => async () => {
    const sig = frag.format('full');
    let args;
    try {
      args = inferArgs(frag, innerCtx);
    } catch (e) {
      return {
        contract: contractLabel,
        function: frag.name,
        signature: sig,
        args: null,
        ok: false,
        error: `arg build: ${e.message}`,
        ms: 0,
      };
    }

    const t0 = Date.now();
    try {
      let fn;
      try {
        fn = contract.getFunction(frag.format('full'));
      } catch {
        fn = contract.getFunction(frag.selector);
      }
      const raw = await fn(...args);
      const ms = Date.now() - t0;
      return {
        contract: contractLabel,
        function: frag.name,
        signature: sig,
        args: serialize(args),
        ok: true,
        result: serialize(raw),
        ms,
      };
    } catch (e) {
      const ms = Date.now() - t0;
      return {
        contract: contractLabel,
        function: frag.name,
        signature: sig,
        args: serialize(args),
        ok: false,
        error: e.shortMessage || e.reason || e.message || String(e),
        ms,
      };
    }
  });

  const calls = await mapPool(tasks, 8, (task) => task());
  const ok = calls.filter((c) => c.ok).length;
  const fail = calls.length - ok;
  return {
    contract: contractLabel,
    address: contract.target,
    summary: { total: calls.length, ok, fail },
    calls,
  };
}

module.exports = { runReadSuite, serialize, inferArgs };
