const { createOCNMPSIntegrator } = require('./ocnmps_core');

const testCases = [
  { text: '写一个 Python 函数计算斐波那契数列', expected: { intent: 'CODE', tags: ['CN'] } },
  { text: '帮我 debug 这个报错', expected: { intent: 'DEBUG', tags: ['CN'] } },
  { text: '审查这段代码有没有漏洞', expected: { intent: 'REVIEW', tags: ['CN'] } },
  { text: '给我写单元测试', expected: { intent: 'TEST', tags: ['CN'] } },
];

console.log('=== OCNMPS V3 最小回归测试 ===\n');

const integrator = createOCNMPSIntegrator({ grayRatio: 0.1 });
const results = [];

async function runTests() {
  for (const tc of testCases) {
    const decision = integrator.handleMessage({
      text: tc.text,
      sessionId: 'test-session',
      defaultModel: 'modelstudio/qwen3.5-plus'
    });
    
    // handleMessage 返回的是 Promise 吗？检查一下
    const resolved = decision.then ? await decision : decision;
    
    const result = {
      timestamp: new Date().toISOString(),
      routeId: resolved.routingTaskId,
      input: tc.text.substring(0, 30) + '...',
      intent: resolved.intent,
      tags: resolved.tags,
      finalModel: resolved.model,
      verificationOk: resolved.verification?.ok,
      expectedIntent: tc.expected.intent,
      expectedTags: tc.expected.tags,
      intentMatch: resolved.intent === tc.expected.intent,
      tagsMatch: JSON.stringify((resolved.tags || []).sort()) === JSON.stringify(tc.expected.tags.sort())
    };
    
    results.push(result);
    
    const status = result.intentMatch && result.tagsMatch ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${tc.text.substring(0, 25)}...`);
    console.log(`  intent: ${resolved.intent} (期望: ${tc.expected.intent}) ${result.intentMatch ? '✓' : '✗'}`);
    console.log(`  tags: [${(resolved.tags || []).join(', ')}] (期望: [${tc.expected.tags.join(', ')}]) ${result.tagsMatch ? '✓' : '✗'}`);
    console.log(`  finalModel: ${resolved.model}`);
    console.log(`  verificationOk: ${resolved.verification?.ok}`);
    console.log(`  routeId: ${resolved.routingTaskId}`);
    console.log('');
  }

  console.log('=== 汇总 ===');
  const allPass = results.every(r => r.intentMatch && r.tagsMatch);
  console.log(`总结果: ${allPass ? '✅ 全部通过' : '❌ 有失败'}`);
  console.log(`通过: ${results.filter(r => r.intentMatch && r.tagsMatch).length}/4`);

  // 输出详细表格
  console.log('\n=== 详细记录 ===');
  console.log(JSON.stringify(results, null, 2));
}

runTests();
