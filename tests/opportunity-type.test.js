import test from 'node:test'
import assert from 'node:assert/strict'
import { getOpportunityTypeFilterValue } from '../src/utils/opportunityType.js'

test('explicit opportunity types take precedence over legacy employment types', () => {
  assert.equal(getOpportunityTypeFilterValue({
    opportunity_type: 'industrial_attachment',
    employment_type: 'internship',
  }), 'industrial_attachment')
})

test('legacy internship and graduate employment types map to placement filters', () => {
  assert.equal(getOpportunityTypeFilterValue({ opportunity_type: null, employment_type: 'internship' }), 'internship')
  assert.equal(getOpportunityTypeFilterValue({ opportunity_type: null, employment_type: 'graduate' }), 'graduate_internship')
})

test('unclassified legacy placements remain filterable as other', () => {
  assert.equal(getOpportunityTypeFilterValue({ opportunity_type: null, employment_type: 'part_time' }), 'other')
})
