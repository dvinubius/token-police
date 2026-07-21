'use strict';

/*
 * Turns the authored demo spec (demo/dataset.js) into provider-shaped JSONL
 * fixtures on disk, laid out exactly like the real transcript directories:
 *
 *   <out>/claude/<encoded-project>/<session-uuid>.jsonl
 *   <out>/claude/<encoded-project>/<session-uuid>/subagents/agent-<hex>.jsonl
 *   <out>/codex/YYYY/MM/DD/rollout-<iso>-<session-uuid>.jsonl
 *
 * Nothing here knows about Sessions, Human requests, or Estimated cost — the
 * real parsers derive all of that from these files, so the demo exercises the
 * production pipeline rather than a parallel one.
 *
 * Token shapes are generated from a seeded PRNG so repeated builds are
 * byte-identical for a given anchor day.
 */

const fs = require('fs');
const path = require('path');
const { PROJECTS, SESSIONS } = require('./dataset');

const DAY_MS = 86400000;
const CLAUDE_VERSION = '2.1.197';
const CODEX_VERSION = '0.129.0';

/* ------------------------------------------------------------------ randomness */

// mulberry32 — small, fast, and deterministic for a given seed.
function makeRng(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Deterministic UUID-shaped id derived from a seed string.
function uuidFrom(seedText) {
  const rng = makeRng(`uuid:${seedText}`);
  const hex = (n) =>
    Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function agentIdFrom(seedText) {
  const rng = makeRng(`agent:${seedText}`);
  return Array.from({ length: 17 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
}

/* ----------------------------------------------------------------------- time */

// Wall-clock start of a Session: `dayOffset` days before the anchor day, at the
// Session's local start hour.
function sessionStart(anchorMidnightMs, dayOffset, startHour, rng) {
  return anchorMidnightMs - dayOffset * DAY_MS + startHour * 3600000 + int(rng, 0, 55) * 60000;
}

/* ------------------------------------------------------------------ token math */

// Running context size for a Session. It grows as the transcript accumulates
// and collapses back down when the agent compacts, which is what keeps long
// Sessions from reading a full context window on every remaining LLM call.
// Codex climbs further before compacting because it runs a much wider window;
// that is also what makes long Codex Sessions sit in the "large context but
// still under half the window" band that Claude Sessions skip past.
const GROWTH = {
  'claude-code': { compactAt: 142000, step: [900, 3800], resetTo: [19000, 31000] },
  codex: { compactAt: 194000, step: [2200, 7400], resetTo: [16000, 28000] },
};

function nextContext(ctx, rng, source) {
  const shape = GROWTH[source] || GROWTH['claude-code'];
  if (ctx >= shape.compactAt) return int(rng, ...shape.resetTo);
  return ctx + int(rng, ...shape.step);
}

/*
 * Claude Code token buckets for one LLM call. The four buckets are disjoint
 * (usage.input_tokens already excludes cached tokens), so `ctx` is split across
 * fresh input, cache read, and cache write.
 */
function claudeUsage(rng, ctx, spike, firstOfRequest) {
  let context = ctx;
  let output = int(rng, 240, 1900);
  let cacheWrite = firstOfRequest ? int(rng, 1100, 6400) : rng() < 0.25 ? int(rng, 300, 1800) : 0;
  let input = int(rng, 120, 900);

  if (spike === 'context') context = int(rng, 118000, 168000);
  if (spike === 'output') output = int(rng, 8600, 13400);
  if (spike === 'cache-write') cacheWrite = int(rng, 22000, 34000);
  if (spike === 'low-cache') {
    // Post-compaction re-read: almost everything is fresh input again.
    context = Math.max(context, int(rng, 52000, 74000));
    input = Math.round(context * 0.93);
    cacheWrite = 0;
  }

  const cacheRead = Math.max(0, context - input - cacheWrite);
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
  };
}

/*
 * Codex reports cumulative totals plus a per-call delta, and `input_tokens`
 * INCLUDES `cached_input_tokens`. Returned deltas follow that convention.
 */
function codexUsage(rng, ctx, spike) {
  let context = ctx;
  let output = int(rng, 320, 2400);
  let reasoning = int(rng, 120, 900);

  if (spike === 'context') context = int(rng, 205000, 268000);
  if (spike === 'output') output = int(rng, 9200, 14500);
  if (spike === 'reasoning') {
    reasoning = int(rng, 2600, 6200);
    output = reasoning + int(rng, 400, 2200);
  }
  if (spike === 'low-cache') context = Math.max(context, int(rng, 48000, 68000));

  const cachedShare = spike === 'low-cache' ? 0.06 : 0.82 + rng() * 0.14;
  const cached = Math.round(context * cachedShare);
  if (reasoning > output) output = reasoning + int(rng, 200, 900);

  return {
    input_tokens: context, // includes cached, per OpenAI semantics
    cached_input_tokens: cached,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
  };
}

/* -------------------------------------------------------------- content pools */

const CLAUDE_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'TodoWrite'];
const CODEX_TOOLS = ['shell', 'apply_patch', 'update_plan'];

function claudeToolUse(rng, project, index) {
  const name = pick(rng, CLAUDE_TOOLS);
  const id = `toolu_${agentIdFrom(`${project.cwd}:${index}:${name}`).slice(0, 12)}`;
  if (name === 'Bash') return { type: 'tool_use', id, name, input: { command: pick(rng, project.commands) } };
  if (name === 'Grep') return { type: 'tool_use', id, name, input: { pattern: 'retry|idempotenc', path: project.cwd } };
  if (name === 'TodoWrite') return { type: 'tool_use', id, name, input: { todos: [] } };
  return { type: 'tool_use', id, name, input: { file_path: `${project.cwd}/${pick(rng, project.files)}` } };
}

function codexToolCall(rng, project, index) {
  const name = pick(rng, CODEX_TOOLS);
  const callId = `call_${agentIdFrom(`${project.cwd}:codex:${index}`).slice(0, 12)}`;
  if (name === 'shell') {
    return { type: 'function_call', name, call_id: callId, arguments: JSON.stringify({ command: pick(rng, project.commands) }), status: 'completed' };
  }
  if (name === 'update_plan') {
    return { type: 'function_call', name, call_id: callId, arguments: JSON.stringify({ plan: [{ step: pick(rng, project.notes), status: 'in_progress' }] }), status: 'completed' };
  }
  return { type: 'function_call', name, call_id: callId, arguments: JSON.stringify({ path: `${project.cwd}/${pick(rng, project.files)}` }), status: 'completed' };
}

// A tool result large enough to register as a nearby-large-output cost driver.
function bigToolResult(project) {
  const line = `${project.cwd}/${project.files[0]}:  const result = await submitPaymentIntent(session, { idempotencyKey });\n`;
  return line.repeat(340);
}

function smallToolResult(rng, project) {
  return `${pick(rng, project.commands)}\n${pick(rng, project.notes)}\n`;
}

/* ------------------------------------------------------- Claude Code transcript */

function claudeRecord(base, extra) {
  return { ...base, ...extra };
}

function buildClaudeLines(session, project, opts) {
  const { sessionId, isSubagent, agentId, agentType, startMs, rng } = opts;
  const lines = [];
  let t = startMs;
  let uuidCounter = 0;
  let prevUuid = null;
  let ctx = int(rng, 11000, 19000);
  let callIndex = 0;

  const nextUuid = () => uuidFrom(`${sessionId}:${isSubagent ? agentId : 'main'}:${uuidCounter++}`);
  const advance = (min, max) => {
    t += int(rng, min, max) * 1000;
    return new Date(t).toISOString();
  };

  const base = () => ({
    isSidechain: isSubagent,
    ...(isSubagent ? { agentId, attributionAgent: agentType } : {}),
    cwd: project.cwd,
    sessionId,
    version: CLAUDE_VERSION,
    gitBranch: 'main',
    userType: 'external',
  });

  const push = (record) => {
    lines.push(JSON.stringify(record));
    prevUuid = record.uuid;
  };

  for (const request of session.requests) {
    const uuid = nextUuid();
    push(
      claudeRecord(base(), {
        parentUuid: prevUuid,
        type: 'user',
        message: { role: 'user', content: request.text },
        uuid,
        timestamp: advance(40, 420),
      })
    );

    for (let i = 0; i < request.calls; i++) {
      const isLast = i === request.calls - 1;
      const spike = isLast ? request.spike : undefined;

      // A large tool result must land immediately before the call it drives.
      if (spike === 'tool-dump') {
        push(
          claudeRecord(base(), {
            parentUuid: prevUuid,
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: `toolu_${agentIdFrom(`${sessionId}:${callIndex}`).slice(0, 12)}`, content: bigToolResult(project) }],
            },
            uuid: nextUuid(),
            timestamp: advance(3, 20),
          })
        );
      } else if (i > 0) {
        push(
          claudeRecord(base(), {
            parentUuid: prevUuid,
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: `toolu_${agentIdFrom(`${sessionId}:${callIndex}:r`).slice(0, 12)}`, content: smallToolResult(rng, project) }],
            },
            uuid: nextUuid(),
            timestamp: advance(2, 18),
          })
        );
      }

      ctx = nextContext(ctx, rng, 'claude-code');
      const usage = claudeUsage(rng, ctx, spike, i === 0);
      const model =
        request.model || (session.smallModel && callIndex > 0 && callIndex % 7 === 6 ? session.smallModel : session.model);

      const toolCount = isLast ? int(rng, 0, 1) : int(rng, 1, 3);
      const content = [{ type: 'text', text: pick(rng, project.notes) }];
      for (let k = 0; k < toolCount; k++) content.push(claudeToolUse(rng, project, callIndex * 5 + k));

      const messageId = `msg_${agentIdFrom(`${sessionId}:msg:${callIndex}`).slice(0, 16)}`;
      const stopReason = toolCount > 0 ? 'tool_use' : 'end_turn';

      // Claude Code streams one assistant API response across several JSONL
      // lines that repeat the same message id and usage; split the content
      // blocks so the parser's per-id merge path is exercised.
      const head = content.slice(0, 1);
      const tail = content.slice(1);
      push(
        claudeRecord(base(), {
          parentUuid: prevUuid,
          type: 'assistant',
          message: { id: messageId, type: 'message', role: 'assistant', model, content: head, stop_reason: tail.length ? null : stopReason, usage },
          uuid: nextUuid(),
          timestamp: advance(6, 95),
        })
      );
      if (tail.length) {
        push(
          claudeRecord(base(), {
            parentUuid: prevUuid,
            type: 'assistant',
            message: { id: messageId, type: 'message', role: 'assistant', model, content: tail, stop_reason: stopReason, usage },
            uuid: nextUuid(),
            timestamp: advance(1, 6),
          })
        );
      }
      callIndex++;
    }
  }

  return lines;
}

/* ------------------------------------------------------------- Codex transcript */

function codexEvent(timestamp, payload) {
  return JSON.stringify({ timestamp, type: 'event_msg', payload });
}

function codexItem(timestamp, payload) {
  return JSON.stringify({ timestamp, type: 'response_item', payload });
}

function buildCodexLines(session, project, opts) {
  const { sessionId, startMs, rng, subagent } = opts;
  const lines = [];
  let t = startMs;
  let ctx = int(rng, 9000, 16000);
  let callIndex = 0;
  const cumulative = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };

  const advance = (min, max) => {
    t += int(rng, min, max) * 1000;
    return new Date(t).toISOString();
  };

  const metaPayload = {
    id: sessionId,
    timestamp: new Date(t).toISOString(),
    cwd: project.cwd,
    originator: 'codex_cli',
    cli_version: CODEX_VERSION,
    source: subagent ? subagent.source : 'cli',
    model_provider: 'openai',
    ...(subagent ? { thread_source: 'subagent', session_id: subagent.parentSessionId } : {}),
  };
  lines.push(JSON.stringify({ timestamp: new Date(t).toISOString(), type: 'session_meta', payload: metaPayload }));

  let activeModel = null;
  for (const request of session.requests) {
    const model = request.model || session.model;
    if (model !== activeModel) {
      activeModel = model;
      lines.push(
        JSON.stringify({
          timestamp: advance(1, 4),
          type: 'turn_context',
          payload: {
            turn_id: uuidFrom(`${sessionId}:turn:${callIndex}`),
            cwd: project.cwd,
            approval_policy: 'on-request',
            sandbox_policy: { type: 'workspace-write' },
            model,
            summary: 'auto',
          },
        })
      );
    }

    lines.push(codexEvent(advance(35, 400), { type: 'user_message', message: request.text, kind: 'plain' }));
    lines.push(codexEvent(advance(1, 3), { type: 'task_started' }));

    for (let i = 0; i < request.calls; i++) {
      const isLast = i === request.calls - 1;
      const spike = isLast ? request.spike : undefined;

      // Activity for a response is written BEFORE the token_count that reports
      // that response's usage, so emit it first.
      const toolCount = isLast ? int(rng, 0, 1) : int(rng, 1, 2);
      for (let k = 0; k < toolCount; k++) {
        const call = codexToolCall(rng, project, callIndex * 3 + k);
        lines.push(codexItem(advance(4, 40), call));
        lines.push(
          codexItem(advance(1, 25), {
            type: 'function_call_output',
            call_id: call.call_id,
            output: spike === 'tool-dump' ? bigToolResult(project) : smallToolResult(rng, project),
            status: 'completed',
          })
        );
      }
      lines.push(codexEvent(advance(2, 30), { type: 'agent_message', message: pick(rng, project.notes) }));

      ctx = nextContext(ctx, rng, 'codex');
      const usage = codexUsage(rng, ctx, spike);
      cumulative.input += usage.input_tokens;
      cumulative.cached += usage.cached_input_tokens;
      cumulative.output += usage.output_tokens;
      cumulative.reasoning += usage.reasoning_output_tokens;
      cumulative.total += usage.input_tokens + usage.output_tokens;

      const info = {
        total_token_usage: {
          input_tokens: cumulative.input,
          cached_input_tokens: cumulative.cached,
          output_tokens: cumulative.output,
          reasoning_output_tokens: cumulative.reasoning,
          total_tokens: cumulative.total,
        },
        last_token_usage: { ...usage, total_tokens: usage.input_tokens + usage.output_tokens },
        model_context_window: 400000,
      };
      const ts = advance(3, 40);
      lines.push(codexEvent(ts, { type: 'token_count', info, rate_limits: null }));
      // Rate-limit ping carrying no usage — the parser must not bill it.
      lines.push(codexEvent(advance(1, 3), { type: 'token_count', info: null, rate_limits: { limit_id: 'codex' } }));
      callIndex++;
    }

    lines.push(codexEvent(advance(1, 5), { type: 'task_complete' }));
  }

  return lines;
}

/* ---------------------------------------------------------------- file layout */

function encodeProjectDir(cwd) {
  return cwd.replace(/\//g, '-');
}

function writeLines(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function codexFileName(sessionId, startMs) {
  const iso = new Date(startMs).toISOString().slice(0, 19).replace(/:/g, '-');
  return `rollout-${iso}-${sessionId}.jsonl`;
}

/**
 * Write every fixture under `outDir`, returning the two watcher source roots.
 */
function writeTranscripts(outDir, anchorMidnightMs) {
  const claudeRoot = path.join(outDir, 'claude');
  const codexRoot = path.join(outDir, 'codex');
  fs.rmSync(outDir, { recursive: true, force: true });

  for (const session of SESSIONS) {
    const project = PROJECTS[session.project];
    const rng = makeRng(session.key);
    const startMs = sessionStart(anchorMidnightMs, session.dayOffset, session.startHour, rng);
    const sessionId = uuidFrom(session.key);

    if (session.source === 'claude-code') {
      const projectDir = path.join(claudeRoot, encodeProjectDir(project.cwd));
      writeLines(
        path.join(projectDir, `${sessionId}.jsonl`),
        buildClaudeLines(session, project, { sessionId, isSubagent: false, startMs, rng })
      );

      for (const [index, child] of (session.subagents || []).entries()) {
        const childRng = makeRng(child.key);
        // Subagents run inside the parent's wall-clock window.
        const childStart = startMs + (index + 1) * int(childRng, 8, 26) * 60000;
        const agentId = agentIdFrom(child.key);
        const childSpec = { ...child, model: child.model, smallModel: undefined };
        writeLines(
          path.join(projectDir, sessionId, 'subagents', `agent-${agentId}.jsonl`),
          buildClaudeLines(childSpec, project, {
            sessionId, // Claude Code writes the PARENT session id on sidechain records
            isSubagent: true,
            agentId,
            agentType: child.agentType,
            startMs: childStart,
            rng: childRng,
          })
        );
      }
      continue;
    }

    const day = new Date(startMs);
    const dayDir = path.join(
      codexRoot,
      String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0')
    );
    writeLines(
      path.join(dayDir, codexFileName(sessionId, startMs)),
      buildCodexLines(session, project, { sessionId, startMs, rng })
    );

    for (const [index, child] of (session.subagents || []).entries()) {
      const childRng = makeRng(child.key);
      const childStart = startMs + (index + 1) * int(childRng, 6, 22) * 60000;
      const childId = uuidFrom(child.key);
      const source =
        child.agentType === 'thread_spawn'
          ? {
              subagent: {
                thread_spawn: {
                  parent_thread_id: sessionId,
                  agent_nickname: child.nickname,
                  agent_role: child.role,
                  depth: child.depth || 1,
                },
              },
            }
          : { subagent: { other: child.other || 'subagent' } };

      const childDay = new Date(childStart);
      const childDayDir = path.join(
        codexRoot,
        String(childDay.getFullYear()),
        String(childDay.getMonth() + 1).padStart(2, '0'),
        String(childDay.getDate()).padStart(2, '0')
      );
      writeLines(
        path.join(childDayDir, codexFileName(childId, childStart)),
        buildCodexLines({ ...child }, project, {
          sessionId: childId,
          startMs: childStart,
          rng: childRng,
          subagent: { source, parentSessionId: sessionId },
        })
      );
    }
  }

  return { claudeRoot, codexRoot };
}

module.exports = { writeTranscripts };
