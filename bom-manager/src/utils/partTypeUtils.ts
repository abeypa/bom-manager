export const resolvePartType = (part: any) => {
  if (part.category === 'MECH-MFG') return { type: 'MECH-MFG', ref: 'MFG-' + part.part_number }
  if (part.category === 'MECH-BOP') return { type: 'MECH-BOP', ref: 'BOP-' + part.part_number }
  if (part.category === 'ELECTRICAL') return { type: 'ELECTRICAL', ref: 'ELE-' + part.part_number }
  if (part.category === 'PNEUMATIC') return { type: 'PNEUMATIC', ref: 'PNE-' + part.part_number }
  return { type: 'OTHER', ref: part.part_number || 'N/A' }
}
