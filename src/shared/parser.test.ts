import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {cases} from '../test/parser-cases.ts'
import {type Entry, isLikelyReport, normalizeEntry} from './parser.js'

for (const [i, testCase] of cases.entries()) {
  test(`parses report case ${i + 1}`, () => {
    const result = normalizeEntry({
      author: 'test_user',
      body: testCase.body,
      created: testCase.created,
      score: 0,
      permalink: null,
    })
    const report: {[key: string]: unknown} = {
      ...result,
      isLikelyReport: isLikelyReport(result),
    }
    for (const [key, expected] of Object.entries(testCase.expected)) {
      assert.equal(report[key as keyof Entry | 'isLikelyReport'], expected, key)
    }
  })
}
