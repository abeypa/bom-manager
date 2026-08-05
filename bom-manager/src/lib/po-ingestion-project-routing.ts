export function hasDefensiblePOProjectEvidence(
  rankedProjects: Array<{ evidence?: string[] }> = [],
  lineRecommendations: Array<{ candidates?: Array<{ project_id?: number }> }> = [],
) {
  const hasExplicitDocumentReference = rankedProjects.some((project) =>
    (project.evidence || []).some((item) => /^PO text contains project (?:number|name)\b/i.test(item)),
  )

  const everyLineHasOneProject = lineRecommendations.length > 0 &&
    lineRecommendations.every((line) => {
      const projectIds = new Set(
        (line.candidates || []).map((candidate) => Number(candidate.project_id)).filter(Number.isFinite),
      )
      return projectIds.size === 1
    })

  return hasExplicitDocumentReference || everyLineHasOneProject
}
