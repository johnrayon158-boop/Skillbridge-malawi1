export function getOpportunityTypeFilterValue(opportunity) {
  if (opportunity.opportunity_type) return opportunity.opportunity_type
  if (opportunity.employment_type === 'internship') return 'internship'
  if (opportunity.employment_type === 'graduate') return 'graduate_internship'
  return 'other'
}
