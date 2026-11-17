import {emptyWork, modelName, stepOf, takeLine, takeText, tokensText, toolText, transcriptPath} from '../extension/lib/transcript.js';
import {test, equal, done} from './harness.js';

const use = (name, input, id = 't1') => ({type: 'assistant', message: {model: 'claude-opus-5-5', content: [{type: 'tool_use', id, name, input}],
    usage: {input_tokens: 2, cache_read_input_tokens: 80000, cache_creation_input_tokens: 700, output_tokens: 50}}});
const result = id => ({type: 'user', message: {content: [{type: 'tool_result', tool_use_id: id}]}});
const say = text => ({type: 'assistant', message: {content: [{type: 'text', text}]}});
const plan = items => use('mcp__ccd_turn__update_plan', {items: items.map(([content, status]) => ({content, status}))}, 'p');
const read = lines => lines.reduce(takeLine, emptyWork());

test('path from logPath', () => equal(transcriptPath('/h', {logPath: '/x/a.jsonl', cwd: '/a', sessionId: 's'}), '/x/a.jsonl'));
test('path from the folder', () => equal(transcriptPath('/home/t', {cwd: '/home/t/git/my.app', sessionId: 's'}), '/home/t/.claude/projects/-home-t-git-my-app/s.jsonl'));

test('task list and its step', () => equal(stepOf(read([plan([['Read', 'completed'], ['Build', 'in_progress'], ['Test', 'pending']])]).plan),
    {index: 2, total: 3, done: 1, text: 'Build'}));
test('advance moves the step', () => equal(stepOf(read([plan([['Read', 'in_progress'], ['Build', 'pending']]), use('mcp__ccd_turn__update_plan', {advance: true}, 'q')]).plan),
    {index: 2, total: 2, done: 1, text: 'Build'}));
test('done and start by number', () => equal(stepOf(read([plan([['A', 'in_progress'], ['B', 'pending'], ['C', 'pending']]),
    use('mcp__ccd_turn__update_plan', {done: [1, 2], start: 3}, 'q')]).plan), {index: 3, total: 3, done: 2, text: 'C'}));
test('wrap-up completes the list', () => equal(stepOf(read([plan([['A', 'in_progress']]), use('mcp__ccd_turn__wrap_up', {recap: 'x'}, 'w')]).plan), null));
test('TodoWrite shows the active form', () => equal(stepOf(read([use('TodoWrite', {todos: [
    {content: 'Run tests', activeForm: 'Running tests', status: 'in_progress'}]})]).plan), {index: 1, total: 1, done: 0, text: 'Running tests'}));
test('the app tools are not the running tool', () => equal(read([use('Bash', {description: 'Run'}, 'b'), plan([['A', 'pending']])]).tool.name, 'Bash'));

test('tool runs until its result', () => equal([read([use('Bash', {}, 'b')]).tool.done, read([use('Bash', {}, 'b'), result('b')]).tool.done], [false, true]));
test('a new prompt clears tool and words', () => equal(read([say('Hi'), use('Bash', {}, 'b'), {type: 'user', message: {content: 'next'}}]), {...read([use('Bash', {}, 'b')]), tool: null, said: ''}));
test('said is the first line', () => equal(read([say('\n  First line\nsecond')]).said, 'First line'));
test('model and context', () => equal([read([use('Bash', {})]).model, read([use('Bash', {})]).context], ['claude-opus-5-5', 80702]));
test('subagent lines are skipped', () => equal(read([{...say('sub'), isSidechain: true}]).said, ''));
test('text with a broken line', () => equal(takeText(emptyWork(), `${JSON.stringify(say('a'))}\n{"type":"assi\n${JSON.stringify(say('b'))}\n`).said, 'b'));

test('tool text', () => equal([
    toolText({name: 'Bash', input: {description: 'Run the tests', command: 'npm t'}}),
    toolText({name: 'Edit', input: {file_path: '/a/b/island.js'}}),
    toolText({name: 'Grep', input: {pattern: 'foo'}}),
    toolText({name: 'mcp__Claude_Browser__navigate', input: {url: 'http://x'}}),
    toolText({name: 'Agent', input: {}}),
    toolText(null),
], ['Bash · Run the tests', 'Edit · island.js', 'Grep · foo', 'navigate · http://x', 'Agent', '']));
test('model names', () => equal([modelName('claude-opus-5-5'), modelName('claude-sonnet-4-5-20250929'), modelName('claude-opus-4-20250514'), modelName('gpt')],
    ['Opus 5.5', 'Sonnet 4.5', 'Opus 4', 'gpt']));
test('tokens', () => equal([tokensText(0), tokensText(812), tokensText(80702), tokensText(1234567)], ['', '812', '81k', '1.2M']));
done('transcript');
