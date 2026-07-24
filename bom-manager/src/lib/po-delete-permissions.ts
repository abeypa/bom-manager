export const PO_DELETE_USER_EMAIL = 'abey.thomas@bepindia.com'

export function canDeletePurchaseOrder(email: string | null | undefined) {
  return String(email || '').trim().toLowerCase() === PO_DELETE_USER_EMAIL
}
