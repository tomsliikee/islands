// What a Claude Code session is doing, read from the lines of its
// transcript (~/.claude/projects/<folder>/<session>.jsonl): the task list
// it keeps, the tool it runs, what it last said, the model and how full
// its context is. Plain values in, plain values out, so it can be tested
// without files.

// A fresh reading, before any line.
export function emptyWork() {
    return {plan: null, tool: null, said: '', model: '', context: 0};
}

// Tools of the app around Claude (its task list, its wrap-up box) are not
// work to show; the task list is read from them instead.
const PLAN_TOOL = /(^|__)update_plan$/;
const WRAP_TOOL = /(^|__)wrap_up$/;
const CHROME_TOOL = /^mcp__ccd_/;

// The transcript's file: the session file names it as logPath in newer
// versions; else Claude Code's folder per working directory, every
// character that is not a letter or digit turned into "-".
export function transcriptPath(home, entry) {
    if (typeof entry?.logPath === 'string' && entry.logPath)
        return entry.logPath;
    const folder = String(entry?.cwd ?? '').replace(/[^a-zA-Z0-9]/g, '-');
    return `${home}/.claude/projects/${folder}/${entry?.sessionId}.jsonl`;
}

function applyPlan(plan, input) {
    if (Array.isArray(input?.items))
        return input.items.map(item => ({text: String(item.content ?? ''), status: item.status}));
    if (!plan)
        return null;
    const next = plan.map(item => ({...item}));
    if (input?.advance) {
        const current = next.findIndex(item => item.status === 'in_progress');
        if (current >= 0)
            next[current].status = 'completed';
        const pending = next.findIndex((item, i) => i > current && item.status === 'pending');
        if (pending >= 0)
            next[pending].status = 'in_progress';
    }
    for (const n of Array.isArray(input?.done) ? input.done : []) {
        if (next[n - 1])
            next[n - 1].status = 'completed';
    }
    if (Number.isInteger(input?.start) && next[input.start - 1])
        next[input.start - 1].status = 'in_progress';
    return next;
}

function firstLine(text) {
    return String(text ?? '').split('\n').map(line => line.trim()).find(Boolean) ?? '';
}

// Takes one transcript line (already parsed) into the reading; returns the
// new reading. Lines of subagents and the app's own records are skipped.
export function takeLine(work, line) {
    if (!line || typeof line !== 'object' || line.isSidechain)
        return work;
    const message = line.message ?? {};
    const content = message.content;
    if (line.type === 'user') {
        // A new prompt: what ran before is over.
        if (typeof content === 'string' || (Array.isArray(content) && content.some(part => part?.type === 'text')))
            return {...work, tool: null, said: ''};
        const result = Array.isArray(content) ? content.find(part => part?.type === 'tool_result' && part.tool_use_id === work.tool?.id) : null;
        return result ? {...work, tool: {...work.tool, done: true}} : work;
    }
    if (line.type !== 'assistant')
        return work;
    let next = work;
    const usage = message.usage;
    if (usage && typeof message.model === 'string' && !message.model.startsWith('<')) {
        const context = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
        next = {...next, model: message.model, context};
    }
    for (const part of Array.isArray(content) ? content : []) {
        if (part?.type === 'text' && firstLine(part.text)) {
            next = {...next, said: firstLine(part.text)};
        } else if (part?.type === 'tool_use') {
            const name = String(part.name ?? '');
            if (PLAN_TOOL.test(name))
                next = {...next, plan: applyPlan(next.plan, part.input)};
            else if (name === 'TodoWrite' && Array.isArray(part.input?.todos))
                next = {...next, plan: part.input.todos.map(todo => ({text: String(todo.activeForm || todo.content || ''), status: todo.status}))};
            else if (WRAP_TOOL.test(name) && next.plan)
                next = {...next, plan: next.plan.map(item => ({...item, status: 'completed'}))};
            if (!CHROME_TOOL.test(name) && name !== 'TodoWrite')
                next = {...next, tool: {id: part.id, name, input: part.input ?? {}, done: false}};
        }
    }
    return next;
}

// Takes a piece of the transcript's text (whole lines) into the reading;
// a line that does not parse is skipped.
export function takeText(work, text) {
    let next = work;
    for (const raw of String(text ?? '').split('\n')) {
        if (!raw.trim())
            continue;
        try {
            next = takeLine(next, JSON.parse(raw));
        } catch {
            // A cut or foreign line: nothing to learn from it.
        }
    }
    return next;
}

// The step it works on: {index, total, done, text}, 1-based; null without
// a task list or when every step is done.
export function stepOf(plan) {
    if (!Array.isArray(plan) || plan.length === 0)
        return null;
    let index = plan.findIndex(item => item.status === 'in_progress');
    if (index < 0)
        index = plan.findIndex(item => item.status === 'pending');
    if (index < 0)
        return null;
    const done = plan.filter(item => item.status === 'completed').length;
    return {index: index + 1, total: plan.length, done, text: plan[index].text};
}

function basename(path) {
    return String(path).split('/').filter(Boolean).at(-1) ?? '';
}

// The tool it runs as a short line: "Bash · Run the tests",
// "Edit · island.js"; an MCP tool without its server's prefix.
export function toolText(tool) {
    if (!tool?.name)
        return '';
    const name = tool.name.replace(/^mcp__.+?__/, '');
    const input = tool.input ?? {};
    const path = input.file_path ?? input.notebook_path ?? input.path;
    const detail = input.description ?? (path ? basename(path) : null) ?? input.pattern ?? input.query ?? input.url ?? input.command ?? '';
    const what = firstLine(detail);
    return what ? `${name} · ${what}` : name;
}

// "claude-opus-5-5" -> "Opus 5.5"; an unknown id as it is.
export function modelName(id) {
    const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(String(id ?? ''));
    if (!match)
        return String(id ?? '');
    const family = match[1][0].toUpperCase() + match[1].slice(1);
    return match[3] ? `${family} ${match[2]}.${match[3]}` : `${family} ${match[2]}`;
}

// Tokens in the context: "812", "81k", "1.2M".
export function tokensText(n) {
    if (!Number.isFinite(n) || n <= 0)
        return '';
    if (n < 1000)
        return String(n);
    if (n < 1e6)
        return `${Math.round(n / 1000)}k`;
    return `${(n / 1e6).toFixed(1)}M`;
}
