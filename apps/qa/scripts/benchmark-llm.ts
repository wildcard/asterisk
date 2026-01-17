/**
 * LLM Matching Performance Benchmark
 *
 * Measures:
 * - Response time per field
 * - Token usage per field
 * - Batch vs individual performance
 * - Cache effectiveness (future)
 */

interface BenchmarkResult {
  fieldCount: number;
  totalTime: number;
  avgTimePerField: number;
  p50: number;
  p95: number;
  p99: number;
  tokensUsed?: number;
  tokensPerField?: number;
}

interface FieldBenchmark {
  fieldId: string;
  fieldLabel: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

const TEST_FIELDS = [
  { id: 'field1', label: 'Your Organization', name: 'org', type: 'text' },
  { id: 'field2', label: 'Your Position', name: 'position', type: 'text' },
  { id: 'field3', label: 'Best way to reach you', name: 'contact', type: 'text' },
  { id: 'field4', label: 'Company Website', name: 'website', type: 'url' },
  { id: 'field5', label: 'Industry', name: 'industry', type: 'text' },
  { id: 'field6', label: 'Company Size', name: 'size', type: 'text' },
  { id: 'field7', label: 'Annual Revenue', name: 'revenue', type: 'text' },
  { id: 'field8', label: 'Department', name: 'dept', type: 'text' },
  { id: 'field9', label: 'Years of Experience', name: 'experience', type: 'number' },
  { id: 'field10', label: 'Preferred Contact Time', name: 'time', type: 'text' },
];

const VAULT_KEYS = [
  'company',
  'jobTitle',
  'email',
  'phone',
  'website',
  'industry',
  'employeeCount',
  'revenue',
  'department',
  'yearsExperience',
];

async function benchmarkSingleField(field: any): Promise<FieldBenchmark> {
  const startTime = performance.now();

  try {
    // Simulate LLM API call
    const response = await fetch('http://127.0.0.1:17373/v1/llm-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: field.label,
        name: field.name,
        type: field.type,
        available_keys: VAULT_KEYS,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await response.json();
    const endTime = performance.now();

    return {
      fieldId: field.id,
      fieldLabel: field.label,
      startTime,
      endTime,
      duration: endTime - startTime,
      success: true,
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      startTime,
      endTime,
      duration: endTime - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function benchmarkSequential(fields: any[]): Promise<BenchmarkResult> {
  console.log(`\n📊 Benchmarking ${fields.length} fields (Sequential)...`);

  const benchmarks: FieldBenchmark[] = [];

  for (const field of fields) {
    const result = await benchmarkSingleField(field);
    benchmarks.push(result);
    console.log(`  ${result.success ? '✓' : '✗'} ${result.fieldLabel}: ${result.duration.toFixed(0)}ms`);
  }

  return calculateStats(benchmarks);
}

async function benchmarkParallel(fields: any[]): Promise<BenchmarkResult> {
  console.log(`\n📊 Benchmarking ${fields.length} fields (Parallel)...`);

  const promises = fields.map(field => benchmarkSingleField(field));
  const benchmarks = await Promise.all(promises);

  benchmarks.forEach(result => {
    console.log(`  ${result.success ? '✓' : '✗'} ${result.fieldLabel}: ${result.duration.toFixed(0)}ms`);
  });

  return calculateStats(benchmarks);
}

function calculateStats(benchmarks: FieldBenchmark[]): BenchmarkResult {
  const durations = benchmarks
    .filter(b => b.success)
    .map(b => b.duration)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return {
      fieldCount: 0,
      totalTime: 0,
      avgTimePerField: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const totalTime = Math.max(...benchmarks.map(b => b.endTime)) - Math.min(...benchmarks.map(b => b.startTime));

  return {
    fieldCount: durations.length,
    totalTime,
    avgTimePerField: durations.reduce((a, b) => a + b, 0) / durations.length,
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)],
  };
}

function printResults(label: string, result: BenchmarkResult) {
  console.log(`\n📈 ${label} Results:`);
  console.log(`   Fields:      ${result.fieldCount}`);
  console.log(`   Total Time:  ${result.totalTime.toFixed(0)}ms`);
  console.log(`   Avg/Field:   ${result.avgTimePerField.toFixed(0)}ms`);
  console.log(`   P50:         ${result.p50.toFixed(0)}ms`);
  console.log(`   P95:         ${result.p95.toFixed(0)}ms`);
  console.log(`   P99:         ${result.p99.toFixed(0)}ms`);
}

async function main() {
  console.log('🚀 LLM Matching Performance Benchmark');
  console.log('=====================================\n');

  // Test 1: Small form (4 fields)
  const smallForm = TEST_FIELDS.slice(0, 4);
  const smallSeq = await benchmarkSequential(smallForm);
  printResults('Small Form (4 fields, Sequential)', smallSeq);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const smallPar = await benchmarkParallel(smallForm);
  printResults('Small Form (4 fields, Parallel)', smallPar);

  // Test 2: Medium form (7 fields)
  const mediumForm = TEST_FIELDS.slice(0, 7);
  await new Promise(resolve => setTimeout(resolve, 1000));

  const mediumSeq = await benchmarkSequential(mediumForm);
  printResults('Medium Form (7 fields, Sequential)', mediumSeq);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const mediumPar = await benchmarkParallel(mediumForm);
  printResults('Medium Form (7 fields, Parallel)', mediumPar);

  // Test 3: Large form (10 fields)
  await new Promise(resolve => setTimeout(resolve, 1000));

  const largeSeq = await benchmarkSequential(TEST_FIELDS);
  printResults('Large Form (10 fields, Sequential)', largeSeq);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const largePar = await benchmarkParallel(TEST_FIELDS);
  printResults('Large Form (10 fields, Parallel)', largePar);

  // Summary
  console.log('\n\n📊 Summary & Recommendations');
  console.log('==============================\n');

  const speedup4 = smallSeq.totalTime / smallPar.totalTime;
  const speedup7 = mediumSeq.totalTime / mediumPar.totalTime;
  const speedup10 = largeSeq.totalTime / largePar.totalTime;

  console.log(`Parallel Speedup:`);
  console.log(`  4 fields:  ${speedup4.toFixed(1)}x faster`);
  console.log(`  7 fields:  ${speedup7.toFixed(1)}x faster`);
  console.log(`  10 fields: ${speedup10.toFixed(1)}x faster`);

  console.log(`\nRecommendations:`);
  if (speedup4 > 1.5) {
    console.log(`  ✓ Use parallel requests for >3 fields`);
  }
  if (largePar.p95 > 5000) {
    console.log(`  ⚠ P95 latency >5s - consider caching or local classifier`);
  }
  if (largePar.avgTimePerField < 2000) {
    console.log(`  ✓ Average response time acceptable`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { benchmarkSequential, benchmarkParallel, calculateStats };
